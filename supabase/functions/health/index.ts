// 最小の Edge Function。外部 import なし、secret キーも使わない。
// JWT の検証は config.toml の [functions.health] verify_jwt = true によりゲートウェイが行う。
Deno.serve(() => {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
