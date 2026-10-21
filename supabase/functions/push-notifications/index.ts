import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Función auxiliar para codificar Base64URL segura.
 */
function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Formatea valores numéricos en formato de moneda colombiana (COP).
 */
function formatCOP(amount: number): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (_e) {
    return `$${amount.toLocaleString()}`;
  }
}

/**
 * Obtiene el token de acceso OAuth2 para Firebase Cloud Messaging HTTP v1 API.
 * Soporta credenciales desde:
 * 1. FIREBASE_SERVICE_ACCOUNT (JSON completo en una sola variable)
 * 2. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY + FIREBASE_PROJECT_ID
 */
async function getFirebaseAccessToken(): Promise<{ accessToken: string; projectId: string }> {
  let clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
  let privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");
  let projectId = Deno.env.get("FIREBASE_PROJECT_ID");

  const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (serviceAccountRaw) {
    try {
      const sa = JSON.parse(serviceAccountRaw);
      clientEmail = sa.client_email;
      privateKey = sa.private_key;
      projectId = sa.project_id;
    } catch (parseErr) {
      console.error("[Push] Error parseando FIREBASE_SERVICE_ACCOUNT:", parseErr);
    }
  }

  if (!clientEmail || !privateKey || !projectId) {
    throw new Error(
      "Faltan credenciales de Firebase. Configura FIREBASE_SERVICE_ACCOUNT o (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY y FIREBASE_PROJECT_ID) en los secrets de Supabase."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const cleanPem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");

  const binaryDerString = atob(cleanPem);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const unsignedToken = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(
    JSON.stringify(payload)
  )}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signedJwt = `${unsignedToken}.${bufferToBase64Url(signature)}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signedJwt}`,
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(
      `Error obteniendo token Google OAuth2 (${tokenResponse.status}): ${errorBody}`
    );
  }

  const tokenData = await tokenResponse.json();
  return { accessToken: tokenData.access_token, projectId };
}

serve(async (req: Request) => {
  // Manejo de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));

    // Soporta tanto eventos Database Webhook (type, table, record) como invocación directa
    const isWebhook = Boolean(body.table && body.record);
    const table = body.table || body.eventType;
    const record = body.record || body;

    let customerId: string | null = record.customer_id || null;
    let storeId: string | null = record.store_id || null;
    let title = body.title || "";
    let messageBody = body.message || body.body || "";
    const customData: Record<string, string> = body.data || {};

    if (isWebhook) {
      // 1. Obtener información de la tienda
      const { data: store } = await supabase
        .from("stores")
        .select("id, store_name")
        .eq("id", storeId)
        .maybeSingle();

      const storeName = store?.store_name || "tu tienda";

      // 2. Obtener saldo actual del cliente en esa tienda
      const { data: customerStore } = await supabase
        .from("customer_stores")
        .select("current_balance")
        .eq("customer_id", customerId)
        .eq("store_id", storeId)
        .maybeSingle();

      const currentBalance = formatCOP(Number(customerStore?.current_balance || 0));
      const amountFormatted = formatCOP(Number(record.amount || 0));

      if (table === "payments") {
        title = "Abono registrado 💳";
        messageBody = `Se registró un abono de ${amountFormatted} en ${storeName}. Tu saldo actual es ${currentBalance}.`;
        customData.type = "payment";
        customData.payment_id = String(record.id);
        customData.amount = String(record.amount);
      } else if (table === "credits") {
        title = "Nuevo fiado registrado 🛒";
        const concept = record.concept ? ` (${record.concept})` : "";
        messageBody = `Se registró un fiado de ${amountFormatted}${concept} en ${storeName}. Saldo pendiente: ${currentBalance}.`;
        customData.type = "credit";
        customData.credit_id = String(record.id);
        customData.amount = String(record.amount);
      }
    }

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: "customer_id es requerido para enviar la notificación" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Consultar tokens FCM activos del cliente
    const { data: tokens, error: tokenError } = await supabase.rpc(
      "obtener_tokens_cliente",
      { p_customer_id: customerId }
    );

    if (tokenError) {
      console.error("[Push] Error en obtener_tokens_cliente:", tokenError);
      return new Response(JSON.stringify({ error: tokenError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!tokens || tokens.length === 0) {
      console.log(`[Push] Cliente ${customerId} no tiene dispositivos vinculados activos.`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "El cliente no tiene dispositivos vinculados a su cuenta.",
          sent: 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Obtener token OAuth2 para la API de Firebase
    const { accessToken, projectId } = await getFirebaseAccessToken();

    // 5. Enviar push a cada dispositivo registrado
    const results = [];
    for (const item of tokens) {
      const fcmToken = item.fcm_token;
      if (!fcmToken) continue;

      const fcmPayload = {
        message: {
          token: fcmToken,
          notification: {
            title,
            body: messageBody,
          },
          data: {
            ...customData,
            title,
            body: messageBody,
          },
          android: {
            priority: "high",
            notification: {
              channelId: "mensajes",
              sound: "default",
            },
          },
        },
      };

      try {
        const fcmRes = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(fcmPayload),
          }
        );

        const fcmJson = await fcmRes.json();
        if (!fcmRes.ok) {
          console.warn(`[Push] Error enviando a token ${fcmToken.substring(0, 10)}...:`, fcmJson);
          // Si el token es inválido o no está registrado, desactivarlo
          if (
            fcmJson?.error?.details?.some((d: any) => d?.errorCode === "UNREGISTERED") ||
            fcmJson?.error?.status === "NOT_FOUND"
          ) {
            console.log(`[Push] Desactivando token obsoleto en Supabase...`);
            await supabase
              .from("dispositivos_vinculados")
              .update({ is_active: false })
              .eq("fcm_token", fcmToken);
          }
          results.push({ token: fcmToken, success: false, error: fcmJson });
        } else {
          console.log(`[Push] Notificación enviada con éxito. MessageId: ${fcmJson.name}`);
          results.push({ token: fcmToken, success: true, messageId: fcmJson.name });
        }
      } catch (sendErr: any) {
        console.error(`[Push] Error de red enviando a ${fcmToken}:`, sendErr);
        results.push({ token: fcmToken, success: false, error: sendErr?.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        customerId,
        title,
        message: messageBody,
        sent: results.filter(r => r.success).length,
        total: results.length,
        results,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    console.error("[Push] Error inesperado en Edge Function:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
