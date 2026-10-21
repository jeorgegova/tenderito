# Configuración de Notificaciones Push (Firebase HTTP v1 + Supabase)

Esta función (`push-notifications`) envía notificaciones push a los celulares de los clientes cuando se registra un **Abono** (`payments`) o un **Fiado** (`credits`).

---

## 1. Descargar la Clave Privada de Firebase (Service Account)

1. Ingresa a la consola de [Firebase Console](https://console.firebase.google.com/).
2. Selecciona tu proyecto: **`tenderito-5c02d`**.
3. Haz clic en el engranaje ⚙️ (Configuración del proyecto) > pestaña **Cuentas de servicio** (Service accounts).
4. Haz clic en **Generar nueva clave privada** (Generate new private key). Se descargará un archivo `.json` con tus credenciales.

---

## 2. Guardar las credenciales en Supabase Secrets

Puedes configurar las variables en Supabase de dos formas:

### Opción A (Recomendada - Un solo secreto con el JSON completo)
Abre el archivo `.json` descargado, copia todo su contenido como una sola línea y configúralo en Supabase:
```bash
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"tenderito-5c02d",...}'
```
*(O desde el Dashboard de Supabase: **Project Settings** > **Edge Functions** > **Add Secret** > Nombre: `FIREBASE_SERVICE_ACCOUNT`).*

### Opción B (Variables separadas)
* `FIREBASE_PROJECT_ID`: `tenderito-5c02d`
* `FIREBASE_CLIENT_EMAIL`: El email que termina en `...iam.gserviceaccount.com` dentro del archivo json.
* `FIREBASE_PRIVATE_KEY`: El texto completo de `private_key` (incluyendo `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`).

---

## 3. Desplegar la Edge Function

Desde la raíz de este proyecto en tu terminal:
```bash
npx supabase functions deploy push-notifications --no-verify-jwt
```

---

## 4. Funcionamiento Automático (Sin Webhooks)

**No necesitas configurar webhooks en el Dashboard de Supabase.**

En el código de la app, el servicio [`src/services/sync.ts`](../../../src/services/sync.ts) y [`src/services/deviceService.ts`](../../../src/services/deviceService.ts):
1. Detectan cada vez que se guarda/sincroniza un **Abono** o **Fiado** en Supabase.
2. **Valida** primero si ese cliente tiene un usuario en el portal y celulares activos en `dispositivos_vinculados`.
3. Si el cliente tiene celular vinculado, invoca automáticamente esta Edge Function para enviarle el mensaje push al instante.
4. Si el cliente no tiene celular vinculado, no hace nada (evita llamadas innecesarias a Firebase).

---

## 5. Diagnóstico: ¿Por qué mi cliente no recibió la notificación?

Ejecuta esta consulta en el **Editor SQL de Supabase** cambiando el documento por el de tu cliente:

```sql
SELECT 
  c.name AS cliente,
  c.document_number AS documento,
  ca.user_id AS usuario_portal,
  dv.device_name AS celular,
  dv.fcm_token IS NOT NULL AS tiene_token_fcm,
  dv.is_active AS dispositivo_activo,
  dv.updated_at AS ultima_conexion
FROM public.customers c
LEFT JOIN public.customer_accounts ca ON ca.customer_id = c.id
LEFT JOIN public.dispositivos_vinculados dv ON dv.user_id = ca.user_id
WHERE c.document_number = 'NUMERO_DOCUMENTO_DEL_CLIENTE';
```

- **Si `usuario_portal` es NULL:** El cliente nunca se ha registrado ni activado en la app como cliente (portal de clientes).
- **Si `tiene_token_fcm` es FALSE o NULL:** El cliente nunca ha iniciado sesión en su celular con la app instalada.
- **Si todo está en TRUE:** El celular está listo para recibir notificaciones en cuanto la Edge Function y el Webhook estén activos.
