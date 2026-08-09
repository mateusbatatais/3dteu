import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase Auth a cada requisição e protege as rotas
 * /admin (exceto a própria página de login) e /conta (exceto entrar/cadastrar)
 * exigindo usuário autenticado. A checagem de *role* (admin_users) fica a
 * cargo de cada layout/página do admin — este proxy só garante que existe
 * uma sessão válida. /conta usa a mesma sessão Supabase Auth, só que sem
 * checagem de role nenhuma — qualquer usuário autenticado (cliente ou
 * admin) pode ver a própria conta.
 *
 * Next.js 16 renomeou o antigo "middleware.ts" para "proxy.ts"
 * (https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Antes do Supabase estar configurado (.env ainda não preenchido), deixa a
  // requisição passar sem checar sessão — evita derrubar o app inteiro em dev.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (request.nextUrl.pathname.startsWith("/admin") && !request.nextUrl.pathname.startsWith("/admin/login")) {
      console.warn("[proxy] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes — /admin não está protegido.");
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isAdminLoginRoute = request.nextUrl.pathname.startsWith("/admin/login");

  if (isAdminRoute && !isAdminLoginRoute && !user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const isContaRoute = request.nextUrl.pathname.startsWith("/conta");
  const isContaAuthRoute =
    request.nextUrl.pathname.startsWith("/conta/entrar") || request.nextUrl.pathname.startsWith("/conta/cadastrar");

  if (isContaRoute && !isContaAuthRoute && !user) {
    return NextResponse.redirect(new URL("/conta/entrar", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|stl)$).*)",
  ],
};
