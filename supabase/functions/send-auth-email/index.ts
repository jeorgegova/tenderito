// supabase/functions/send-auth-email/index.ts
// Hook "Send Email" de Supabase Auth para Tenderito usando Gmail SMTP (con contraseña de aplicación).
// Configurar en: Supabase Dashboard → Authentication → Hooks → Send Email (Auth Hook)
//
// Secrets requeridos en Supabase:
// - SMTP_USER: Tu correo de Gmail (ej: micorreo@gmail.com)
// - SMTP_PASS: Contraseña de aplicación de Google de 16 caracteres
// - SMTP_HOST: smtp.gmail.com (opcional, default: smtp.gmail.com)
// - SMTP_PORT: 465 (opcional, default: 465)
// - SMTP_FROM_NAME: "Tenderito" (opcional)
// - SITE_URL: URL pública de la PWA (opcional)
// - LOGO_URL: URL pública del logo (opcional, por defecto usa GitHub raw de NuevoLogo.png)
// - SEND_EMAIL_HOOK_SECRET: Secreto generado por Supabase al activar el hook (opcional si se invoca directo)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import nodemailer from "npm:nodemailer@6.9.13";

const BRAND_ORANGE = "#FF6B00";
const BRAND_PEACH = "#FFE4D0";
const BRAND_DARK = "#142033";
const BRAND_BG = "#FFF1E5";
const BRAND_NAME = "Tenderito";

// 🎨 Plantilla HTML institucional para correos de Tenderito con las curvas y círculos característicos de la sección Inicio (Home)
function getTemplate({
  title,
  message,
  token,
  logoUrl,
}: {
  title: string;
  message: string;
  token?: string;
  logoUrl: string;
}) {
  return `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>${title}</title>
<style>
  :root {
    color-scheme: light;
    supported-color-schemes: light;
  }
  /* Bloquear inversión de modo oscuro en iOS Mail, Apple Mail, Outlook y Android */
  @media (prefers-color-scheme: dark) {
    body, .email-bg {
      background-color: #F6F8FA !important;
      background: #F6F8FA !important;
    }
    .email-card, .email-card-td {
      background-color: #FFFFFF !important;
      background: #FFFFFF !important;
    }
    .email-title {
      color: #142033 !important;
    }
    .email-desc {
      color: #596375 !important;
    }
    .email-code-box {
      background-color: #FFF1E5 !important;
      background: #FFF1E5 !important;
    }
    .email-code {
      color: #FF6B00 !important;
    }
    .email-footer {
      color: #8B95A5 !important;
    }
  }
</style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:#F6F8FA;background-image:linear-gradient(#F6F8FA,#F6F8FA);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table class="email-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;background-color:#F6F8FA;background-image:linear-gradient(#F6F8FA,#F6F8FA);">
    <tr>
      <td align="center">
        <!-- TARJETA INSTITUCIONAL CON ONDAS Y CÍRCULOS DE LA SECCIÓN INICIO / HOME -->
        <table class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);border-radius:24px;overflow:hidden;box-shadow:0 14px 40px rgba(255,107,0,0.10), 0 4px 16px rgba(20,32,51,0.05);border:1px solid ${BRAND_PEACH};">
          
          <!-- CABECERA: SURCO CURVO Y GOTAS ESTILO INICIO (TOP-RIGHT) -->
          <tr>
            <td class="email-card-td" style="padding:0;background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Gotas satélites de Inicio (Lado izquierdo superior) -->
                  <td width="35%" align="left" valign="top" style="padding:24px 0 0 24px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom:10px;"><div style="width:14px;height:14px;border-radius:50%;background-color:${BRAND_PEACH};"></div></td>
                      </tr>
                      <tr>
                        <td style="padding-left:18px;padding-bottom:12px;"><div style="width:8px;height:8px;border-radius:50%;background-color:${BRAND_ORANGE};"></div></td>
                      </tr>
                      <tr>
                        <td style="padding-left:4px;"><div style="width:11px;height:11px;border-radius:50%;background-color:${BRAND_PEACH};"></div></td>
                      </tr>
                    </table>
                  </td>

                  <!-- Espacio central superior -->
                  <td width="20%">&nbsp;</td>

                  <!-- Surco Curvo de Inicio (Onda Peach y Naranja de Header.tsx) -->
                  <td width="45%" align="right" valign="top" style="padding:0;">
                    <table cellpadding="0" cellspacing="0" border="0" align="right" style="margin:0;">
                      <tr>
                        <td align="right" valign="top" style="padding:0;">
                          <div style="width:160px;height:115px;background-color:${BRAND_PEACH};border-bottom-left-radius:100px;border-top-left-radius:30px;padding:0;overflow:hidden;">
                            <div style="width:130px;height:95px;background-color:${BRAND_ORANGE};border-bottom-left-radius:80px;border-top-left-radius:24px;margin-left:30px;">
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Gotas de marca orgánicas bajo el surco curvo -->
              <table cellpadding="0" cellspacing="0" border="0" align="right" style="margin-top:-28px;margin-right:24px;">
                <tr>
                  <td style="padding:0 5px;"><div style="width:20px;height:20px;border-radius:50%;background-color:${BRAND_ORANGE};border:2px solid #FFFFFF;"></div></td>
                  <td style="padding:0 5px;"><div style="width:24px;height:24px;border-radius:50%;background-color:${BRAND_PEACH};border:2px solid #FFFFFF;"></div></td>
                  <td style="padding:0 5px;"><div style="width:15px;height:15px;border-radius:50%;background-color:${BRAND_ORANGE};border:2px solid #FFFFFF;"></div></td>
                  <td style="padding:0 4px;"><div style="width:9px;height:9px;border-radius:50%;background-color:${BRAND_PEACH};border:2px solid #FFFFFF;"></div></td>
                  <td style="padding:0 3px;"><div style="width:8px;height:8px;border-radius:50%;background-color:${BRAND_ORANGE};border:2px solid #FFFFFF;"></div></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- LOGO TENDERITO E INDICADOR INSTITUCIONAL -->
          <tr>
            <td class="email-card-td" style="padding:10px 24px 8px 24px;text-align:center;background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);">
              <div style="display:inline-block;margin-bottom:8px;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:${BRAND_ORANGE};vertical-align:middle;margin-right:6px;"></span>
                <span style="font-size:11px;font-weight:800;letter-spacing:2px;color:${BRAND_ORANGE};vertical-align:middle;">TENDERITO</span>
              </div>
              <br/>
              <img src="${logoUrl}" alt="${BRAND_NAME}" width="180" style="max-width:180px;width:100%;height:auto;display:inline-block;border:0;" />
              <div style="width:44px;height:4px;background-color:${BRAND_ORANGE};background-image:linear-gradient(${BRAND_ORANGE},${BRAND_ORANGE});border-radius:999px;margin:12px auto 0 auto;"></div>
            </td>
          </tr>

          <!-- CONTENIDO PRINCIPAL -->
          <tr>
            <td class="email-card-td" style="padding:16px 36px 32px 36px;text-align:center;background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);">
              <h1 class="email-title" style="margin:0 0 12px 0;font-size:22px;font-weight:800;color:${BRAND_DARK};letter-spacing:-0.4px;">
                ${title}
              </h1>
              <p class="email-desc" style="margin:0 0 28px 0;font-size:14.5px;color:#596375;line-height:1.6;">
                ${message}
              </p>

              <!-- CAJA EXCLUSIVA DEL CÓDIGO DE 6 DÍGITOS -->
              <div class="email-code-box" style="background-color:${BRAND_BG};background-image:linear-gradient(${BRAND_BG},${BRAND_BG});border:2px dashed ${BRAND_ORANGE};border-radius:20px;padding:24px 16px;text-align:center;margin:0 auto 24px auto;">
                <p style="font-size:12px;color:#945727;margin:0 0 8px 0;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">
                  Tu código de 6 dígitos
                </p>
                <div class="email-code" style="font-size:40px;font-weight:800;letter-spacing:10px;color:${BRAND_ORANGE};font-family:'Courier New',Courier,monospace;line-height:1.1;padding-left:10px;">
                  ${token || "------"}
                </div>
                <p style="font-size:12px;color:#7A6B60;margin:10px 0 0 0;font-weight:500;">
                  Escríbelo en la pantalla de Tenderito
                </p>
              </div>

              <p class="email-footer" style="font-size:12.5px;color:#8B95A5;line-height:1.5;margin:0;">
                Este código vence en pocos minutos y solo puede usarse una vez.
              </p>
            </td>
          </tr>

          <!-- PIE DE TARJETA CON EL SURCO CURVO INFERIOR IZQUIERDO DE INICIO (BOTTOM-LEFT) -->
          <tr>
            <td class="email-card-td" style="padding:0;background-color:#FAFBFC;background-image:linear-gradient(#FAFBFC,#FAFBFC);border-top:1px solid #F0F2F5;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Surco inferior izquierdo (bottom-left de Inicio) -->
                  <td width="35%" align="left" valign="bottom" style="padding:0;">
                    <div style="width:130px;height:70px;background-color:${BRAND_PEACH};border-top-right-radius:80px;border-bottom-right-radius:20px;overflow:hidden;">
                      <div style="width:105px;height:55px;background-color:${BRAND_ORANGE};border-top-right-radius:65px;border-bottom-right-radius:15px;margin-top:15px;">
                      </div>
                    </div>
                  </td>
                  <td width="65%" align="right" valign="middle" style="padding:16px 24px 16px 0;">
                    <p class="email-footer" style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#596375;">
                      © 2026 ${BRAND_NAME} — Tu libreta de fiados digital.
                    </p>
                    <p class="email-footer" style="margin:0;font-size:11.5px;color:#8B95A5;line-height:1.4;">
                      Si no solicitaste este código, ignora este mensaje.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Gotas satélites de pie de pantalla (Bottom-left) -->
        <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:16px;">
          <tr>
            <td style="padding:0 6px;"><div style="width:10px;height:10px;border-radius:50%;background-color:${BRAND_PEACH};"></div></td>
            <td style="padding:0 6px;"><div style="width:14px;height:14px;border-radius:50%;background-color:${BRAND_ORANGE};"></div></td>
            <td style="padding:0 6px;"><div style="width:8px;height:8px;border-radius:50%;background-color:${BRAND_PEACH};"></div></td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// 📄 Textos según el tipo de acción
function getContent(emailType: string) {
  switch (emailType) {
    case "recovery":
      return {
        subject: "Tu código de recuperación de Tenderito 🔑",
        title: "Restablece tu contraseña",
        message: "Hemos generado tu código de seguridad de 6 dígitos para cambiar la contraseña. Ingrésalo en la app de Tenderito:",
      };
    case "signup":
      return {
        subject: "Bienvenido a Tenderito 👋",
        title: "Confirma tu cuenta",
        message: "Falta un solo paso para activar tu libreta de fiados digital. Usa el código de 6 dígitos en tu app para comenzar:",
      };
    case "magic_link":
      return {
        subject: "Tu código de acceso a Tenderito 🚀",
        title: "Inicia sesión",
        message: "Usa el siguiente código de 6 dígitos para ingresar a tu cuenta de Tenderito:",
      };
    case "email_change":
      return {
        subject: "Confirma tu nuevo correo ✉️",
        title: "Cambio de correo",
        message: "Hemos recibido una solicitud para cambiar tu correo. Confírmalo ingresando este código en la app:",
      };
    default:
      return {
        subject: "Tu código de verificación de Tenderito",
        title: "Código de verificación",
        message: "Usa el siguiente código en la app de Tenderito para continuar:",
      };
  }
}

// 🚀 SERVIDOR EDGE FUNCTION
serve(async (req: Request) => {
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
    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers);

    // 🔏 Si existe SEND_EMAIL_HOOK_SECRET configurado, verificar la firma del Webhook
    const hookSecretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";
    if (hookSecretRaw) {
      const hookSecret = hookSecretRaw.replace("v1,whsec_", "");
      try {
        const wh = new Webhook(hookSecret);
        wh.verify(rawBody, headers);
      } catch (signErr: any) {
        console.warn("[SendAuthEmail] Firma de webhook no coincide o falta secreto:", signErr?.message);
      }
    }

    const payload = JSON.parse(rawBody || "{}");
    const emailData = payload.email_data || {};
    const user = payload.user || {};

    const emailType = emailData.email_action_type || payload.type || "recovery";
    const token = emailData.token || payload.token || "";
    const toEmail = user.email || payload.email || "";

    if (!toEmail) {
      throw new Error("Falta el correo destinatario (toEmail)");
    }

    // Configuración SMTP desde secrets de Supabase
    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || "465");
    const smtpUser = Deno.env.get("SMTP_USER") || "";
    const smtpPass = (Deno.env.get("SMTP_PASS") || "").replace(/\s+/g, ""); // Limpiar espacios de la contraseña de app
    const fromName = Deno.env.get("SMTP_FROM_NAME") || BRAND_NAME;

    if (!smtpUser || !smtpPass) {
      throw new Error("Faltan las credenciales SMTP_USER y/o SMTP_PASS en los secrets de Supabase.");
    }

    // 🌐 Logo cargado directamente desde GitHub (sin adjuntos en el correo)
    const siteURL = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    const defaultLogo = "https://raw.githubusercontent.com/jeorgegova/tenderito-web/main/src/assets/NuevoLogo.png";
    const logoUrl = Deno.env.get("LOGO_URL") || (siteURL ? `${siteURL}/assets/NuevoLogo.png` : defaultLogo);

    const content = getContent(emailType);

    // Configurar transporte Nodemailer con Gmail SMTP
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const html = getTemplate({
      title: content.title,
      message: content.message,
      token,
      logoUrl,
    });

    // Envío limpio: sin attachments para evitar el icono de clip o archivos adjuntos
    const mailOptions: any = {
      from: `"${fromName}" <${smtpUser}>`,
      to: toEmail,
      subject: content.subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`[SendAuthEmail] Correo enviado exitosamente a ${toEmail}. MessageId: ${info.messageId}`);

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.error("[SendAuthEmail] Error enviando correo:", err?.message || err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 200, // Retornamos 200 para que el Auth Hook de Supabase no rompa el flujo de Auth
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
