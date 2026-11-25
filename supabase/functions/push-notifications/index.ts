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

    const rawBody = await req.json().catch(() => ({}));

    // Soporta cuerpos planos, anidados en body.body, o desde webhooks de Supabase
    const body =
      rawBody?.body && typeof rawBody.body === "object" && !Array.isArray(rawBody.body)
        ? { ...rawBody.body, ...rawBody }
        : rawBody;

    const record =
      body.record && typeof body.record === "object" && !Array.isArray(body.record)
        ? body.record
        : body;

    const oldRecord =
      body.old_record && typeof body.old_record === "object" && !Array.isArray(body.old_record)
        ? body.old_record
        : {};

    const table = String(body.table || body.tableName || record.table || "").toLowerCase();
    const opType = String(body.type || body.op || "").toUpperCase(); // "INSERT", "UPDATE", "DELETE"
    const eventType = String(body.eventType || record.eventType || "").toLowerCase();
    const bodyType = String(body.type || "").toLowerCase();

    const customerId =
      record.customer_id ||
      body.customer_id ||
      body.customerId ||
      record.customerId ||
      null;

    let storeId =
      record.store_id ||
      body.store_id ||
      body.storeId ||
      record.storeId ||
      null;

    const amount = Number(record.amount ?? body.amount ?? 0);
    const concept = record.concept || body.concept || "";
    const notes = record.notes || body.notes || "";
    const recordId = record.id || body.id || body.movementId || record.movementId || "";

    const statusStr = String(
      record.status || body.status || record.estado || body.estado || ""
    ).toLowerCase().trim();

    const oldStatusStr = String(
      oldRecord.status || oldRecord.estado || ""
    ).toLowerCase().trim();

    // Detección exhaustiva de anulación/cancelación
    const isCancelled =
      statusStr === "cancelled" ||
      statusStr === "canceled" ||
      statusStr === "anulado" ||
      statusStr === "anulada" ||
      eventType === "credit_cancelled" ||
      eventType === "payment_cancelled" ||
      eventType === "cancelled" ||
      eventType === "canceled" ||
      eventType === "anulado" ||
      bodyType === "credit_cancelled" ||
      bodyType === "payment_cancelled" ||
      (opType === "UPDATE" && (statusStr === "cancelled" || statusStr === "canceled" || statusStr === "anulado")) ||
      (oldStatusStr !== "" && oldStatusStr !== "cancelled" && (statusStr === "cancelled" || statusStr === "canceled"));

    // Detección de fiado/crédito vs abono/pago vs estado publicitario
    const isStoreStatus =
      table === "store_statuses" ||
      table === "store_status" ||
      eventType === "store_status" ||
      bodyType === "store_status";

    const isCredit =
      !isStoreStatus &&
      (table === "credits" ||
        table === "credit" ||
        eventType === "credit" ||
        eventType === "credit_cancelled" ||
        bodyType === "credit" ||
        bodyType === "credit_cancelled" ||
        Boolean(record.concept) ||
        Boolean(body.concept));

    // Si es un evento UPDATE disparado por un Webhook/Trigger de base de datos y NO es una cancelación,
    // omitir para evitar falsas notificaciones de "Nuevo fiado" o "Abono registrado" al recalcular saldos
    if (opType === "UPDATE" && !isCancelled) {
      console.log(`[Push] Evento UPDATE en ${table || "tabla"} no es cancelación (status: "${statusStr}"), omitiendo notificación.`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Evento UPDATE ignorado porque no corresponde a una cancelación de movimiento.",
          sent: 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isStoreStatus && !customerId) {
      return new Response(
        JSON.stringify({ error: "customer_id es requerido para enviar la notificación" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (isStoreStatus && !storeId) {
      return new Response(
        JSON.stringify({ error: "store_id es requerido para notificar estados de tienda" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Si storeId no vino en el payload, buscarlo en customer_stores
    if (!storeId && customerId) {
      const { data: cs } = await supabase
        .from("customer_stores")
        .select("store_id")
        .eq("customer_id", customerId)
        .limit(1)
        .maybeSingle();
      if (cs?.store_id) {
        storeId = cs.store_id;
      }
    }

    // 2. Obtener nombre de la tienda
    let storeName = "tu tienda";
    if (storeId) {
      const { data: store } = await supabase
        .from("stores")
        .select("id, store_name")
        .eq("id", storeId)
        .maybeSingle();
      if (store?.store_name) {
        storeName = store.store_name;
      }
    }

    let title = body.title || "";
    let messageBody = body.message || body.body || "";
    const customData: Record<string, string> = {};

    if (body.data && typeof body.data === "object") {
      for (const [k, v] of Object.entries(body.data)) {
        if (v != null) customData[k] = String(v);
      }
    }

    // Rama para Estados / Publicidad de Tienda
    if (isStoreStatus) {
      const captionText = String(
        record.caption || body.caption || messageBody || "Nueva publicidad disponible"
      ).trim();
      title = title || `📢 ${storeName}`;
      messageBody = captionText;
      customData.type = "store_status";
      customData.store_id = String(storeId);
      customData.status_id = String(recordId);
      customData.caption = captionText;
      customData.url = `/?openStatusStoreId=${storeId}&statusId=${recordId}`;
    } else {
      // 3. Obtener saldo actual del cliente
      let balanceNum = 0;
      if (customerId && storeId) {
        const { data: customerStore } = await supabase
          .from("customer_stores")
          .select("current_balance")
          .eq("customer_id", customerId)
          .eq("store_id", storeId)
          .maybeSingle();
        if (customerStore?.current_balance != null) {
          balanceNum = Number(customerStore.current_balance);
        }
      }
      if (balanceNum === 0 && customerId) {
        const { data: cust } = await supabase
          .from("customers")
          .select("current_balance")
          .eq("id", customerId)
          .maybeSingle();
        if (cust?.current_balance != null) {
          balanceNum = Number(cust.current_balance);
        }
      }

      const currentBalance = formatCOP(balanceNum);
      const amountFormatted = formatCOP(amount);

      if (isCancelled) {
        if (isCredit) {
          title = "Fiado cancelado ❌";
          const conceptText = concept ? ` (${concept})` : "";
          messageBody = `Se canceló el fiado de ${amountFormatted}${conceptText} en ${storeName}. Tu saldo actual es ${currentBalance}.`;
          customData.type = "credit_cancelled";
          customData.status = "cancelled";
          customData.credit_id = String(recordId);
          customData.amount = String(amount);
        } else {
          title = "Abono cancelado ❌";
          messageBody = `Se canceló el abono de ${amountFormatted} en ${storeName}. Tu saldo actual es ${currentBalance}.`;
          customData.type = "payment_cancelled";
          customData.status = "cancelled";
          customData.payment_id = String(recordId);
          customData.amount = String(amount);
        }
      } else if (table === "payments" || eventType === "payment" || bodyType === "payment" || (!isCredit && amount > 0)) {
        title = "Abono registrado 💳";
        messageBody = `Se registró un abono de ${amountFormatted} en ${storeName}. Tu saldo actual es ${currentBalance}.`;
        customData.type = "payment";
        customData.status = "active";
        customData.payment_id = String(recordId);
        customData.amount = String(amount);
      } else if (isCredit) {
        title = "Nuevo fiado registrado 🛒";
        const conceptText = concept ? ` (${concept})` : "";
        messageBody = `Se registró un fiado de ${amountFormatted}${conceptText} en ${storeName}. Saldo pendiente: ${currentBalance}.`;
        customData.type = "credit";
        customData.status = "active";
        customData.credit_id = String(recordId);
        customData.amount = String(amount);
      } else {
        if (!title) title = "Notificación de Tenderito";
        if (!messageBody) messageBody = `Tu saldo actual en ${storeName} es ${currentBalance}.`;
      }
    }

    // 4. Consultar tokens FCM activos
    let tokens: { fcm_token: string; platform?: string; device_name?: string }[] = [];
    let queryError: any = null;

    if (isStoreStatus) {
      console.log(`[Push] Consultando tokens de clientes para la tienda: ${storeId}`);
      const { data: storeTokens, error: storeTokenError } = await supabase.rpc(
        "obtener_tokens_clientes_tienda",
        { p_store_id: storeId }
      );
      if (storeTokenError) {
        queryError = storeTokenError;
        console.error("[Push] Error en obtener_tokens_clientes_tienda:", storeTokenError);
      } else if (storeTokens && storeTokens.length > 0) {
        tokens = storeTokens;
        console.log(`[Push] Se encontraron ${tokens.length} tokens para la tienda ${storeId}`);
      }
    } else {
      const { data: rpcTokens, error: tokenError } = await supabase.rpc(
        "obtener_tokens_cliente",
        { p_customer_id: customerId }
      );

      if (tokenError) {
        queryError = tokenError;
      } else if (rpcTokens && rpcTokens.length > 0) {
        tokens = rpcTokens;
      } else {
        // Fallback: Si customerId recibido fuera directamente el user_id de auth
        const { data: directTokens } = await supabase
          .from("dispositivos_vinculados")
          .select("fcm_token, platform, device_name")
          .eq("user_id", customerId)
          .eq("is_active", true);

        if (directTokens && directTokens.length > 0) {
          tokens = directTokens;
        }
      }
    }

    if (queryError && tokens.length === 0) {
      console.error("[Push] Error al obtener tokens:", queryError);
      return new Response(JSON.stringify({ error: queryError.message || String(queryError) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!tokens || tokens.length === 0) {
      console.log(
        `[Push] No hay dispositivos activos vinculados para ${
          isStoreStatus ? `la tienda ${storeId}` : `el cliente ${customerId}`
        }.`
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: isStoreStatus
            ? "Ningún cliente de la tienda tiene dispositivos vinculados activos."
            : "El cliente no tiene dispositivos vinculados a su cuenta.",
          sent: 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Obtener token OAuth2 para la API de Firebase
    const { accessToken, projectId } = await getFirebaseAccessToken();

    // 6. Enviar push a cada dispositivo registrado
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
          webpush: {
            headers: {
              Urgency: "high",
            },
            notification: {
              title,
              body: messageBody,
              icon: "/logo.png",
              badge: "/favicon.svg",
              vibrate: [200, 100, 200],
            },
            fcm_options: {
              link: customData.url || "/",
            },
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title,
                  body: messageBody,
                },
                sound: "default",
                badge: 1,
              },
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
