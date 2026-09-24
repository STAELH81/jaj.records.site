export function withMigrationMaintenance(handler) {
  return (request, context) => {
    if (globalThis.Netlify?.env?.get('AQ_ACCOUNT_MIGRATION_MAINTENANCE') === 'true') {
      return new Response(JSON.stringify({ error: 'account_migration_maintenance' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '300' },
      });
    }
    return handler(request, context);
  };
}
