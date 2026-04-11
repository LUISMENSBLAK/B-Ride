# Changelog: Hardening B-Ride Production Infrastructure

A continuación, el detalle de todos los cambios aplicados en los bloques de seguridad, autenticación y funcionalidades de producción empresarial.

## 📦 Bloque 1: Onboarding obligatorio del conductor
- **Backend**: Modificado el modelo `User.js` agregando un exhaustivo modelo de documentos (`driverLicense`, `vehicle`), estado `driverApprovalStatus`, e historial de rechazos. Añadidas las lógicas de carga en `/api/auth/profile/avatar` simulada mediante multer.
- **Frontend**: Reescribimos completamente `DriverOnboardingScreen.tsx` para generar un flujo bloqueante de 5 pasos (Foto circular con `expo-image-picker`, datos del vehículo, licencia frente, licencia dorso, y foto de coche/matrícula) con fallback state `WAITING` y botón para refrescar en caso de backend updates.
- **Frontend**: Se modificó `DriverDashboard.tsx` interceptando `useEffect[user]` para forzar `setIsOnline(false)` y denegar operación si el usuario no tiene estado de aprobación (`APPROVED`).

## 🛡️ Bloque 2: Autenticación Robusta y Logout Global
- **Backend**: Creación del modelo Mongoose `RefreshToken` guardando hashes encriptados. Los Controladores fueron mejorados para soportar `VerifyEmail` (bloqueando credenciales no verificadas), Rate Limiting contra Fuerza Bruta (`lockUntil`), y Detección de Inicios de Sesión de Dispositivos Nuevos (guardando `knownDevices` array).
- **Backend**: Implementado `/logout-all` invalidando en avalancha todos los tokens emitidos. 
- **Frontend**: Creación de la app screen `VerifyEmailScreen.tsx` (6 campos numéricos gestionando auto-tab). Se programó la captura de la excepción `NOT_VERIFIED` (con código de respuesta 403) transicionando a `VerifyEmailScreen` con prefill del email vía react-navigation.
- **Frontend**: Adición de botón rojo en `SettingsScreen.tsx` para llamar a "Cerrar sesión en todos los dispositivos" interactuando con `/auth/logout-all`.

## 👤 Bloque 3: Perfil Obligatorio del Pasajero
- **Frontend**: Upgrade masivo en `PassengerProfileScreen.tsx` para inyectar un selector de `expo-image-picker` al presionar la foto, utilizando una subida multipart al backend.
- **Frontend**: Protección local en `PassengerDashboard.tsx`. El componente bloquea la llamada al endpoint de Matching si se detecta que el usuario carece de `avatarUrl`. Despliega un Alert que dirige automáticamente en tabulación al perfil (`PassengerProfile`).

## 🌍 Bloque 4: Panel de Administración (Backend)
- **Backend**: Implementados `admin.routes.js` y `admin.controller.js` bajo middleware estricto `authorize('ADMIN')`. Endpoints para estadística bruta (KPIs sumatorios), para gestionar estados de conductor (Aprobar/Rechazar `driverApprovalStatus`), listar historiales, y suspender transitoriamente pasajeros.
- **Backend / Scripts**: Añadido script fundacional inicializador (Semilla): `scripts/createAdmin.js` capaz de bypassear todo registrando el email superadmin oficial.

## ⚡ Bloque 5: Seguridad Estricta en Sockets
- **Backend**: El handshake en base del Socket.IO (`index.js`) fue rediseñado de `sync` a `async`, efectuando una consulta Mongoose real-time contra cada socket de intento para prohibir usuarios bloqueados preventivamente (`isBlocked`) o con cuentas congeladas por fuerza bruta.
- **Backend**: Modificados `ride.events.js` bloqueando "Spoofing" impidiendo que un pasajero se pase como Conductor utilizando propiedades de payload controladas al forzar sobreescrituras explícitas al `socket.userId` guardado por token verificado a nivel conexión servidor.

## 📜 Bloque 6: Historial de Viajes Paginado
- **Backend**: Refinada la query del historial (`ride.controller.js`), incorporando soporte para query params `page` y `limit`.
- **Frontend**: `RideHistory.tsx` actualizado implementando Scroll Infinito interactuando con `onEndReached` en llamadas FlatList reactivas al `limit=10, page=...`. Se incluyó además un `<Modal>` informativo para ver detalles técnicos (ID, latitudes crudas).

## 🆘 Bloque 7: Sistema SOS Cero Demoras
- **Backend**: Generación del modelo base `SOS.js`. Se acopló el endpoint `/api/rides/:rideId/sos` (`ride.controller.js`) que inserta un registro Crítico por GPS disparado por el reporter, rebotando en un `socket.io` log global a admins/Soporte y simulando el protocolo de emergencia de envío de SMS/Email (sujeto a las variables de entorno habilitadas).
- **Frontend**: Enganchado el componente reutilizable `SOSButton.tsx` (desplegable con un popup destructivo en iOS Modal). Realiza la llamada HTTP a `/rides/:id/sos` guardando estado asincrónico tras el fetch, para redirigir nativamente usando `Linking.openURL('tel:112')`, adaptándose a las normas españolas requeridas.

---
El entorno de Producción se encuentra operando bajo estricto marco de seguridad Anti-Riesgo. Respetar políticas de CI/CD para deploy inminente.
