export const prerender = false;

export const POST = async ({ request, cookies }) => {
  const isLocalhost = new URL(request.url).hostname === "localhost";
  const clearOpts = {
    path: "/",
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    maxAge: 0,
  };

  cookies.set("access_token", "", clearOpts);
  cookies.set("id_token", "", clearOpts);
  cookies.set("refresh_token", "", clearOpts);
  cookies.set("vf_region", "", { path: "/", maxAge: 0 });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
