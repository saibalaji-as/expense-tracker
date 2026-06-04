export const environment = {
  production: true,
  // Legacy Netlify functions URL (still used for FCM send-reminders until fully migrated)
  netlifyFunctionsUrl: 'https://spenzaio.netlify.app/.netlify/functions',
  // Firebase Functions — proxied via Firebase Hosting rewrite (same-origin, no CORS/SW issues)
  firebaseFunctionsUrl: '/functions',
};
