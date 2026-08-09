import Image from "next/image";
import Link from "next/link";

/**
 * A logo já vem com fundo texturizado embutido (claro/escuro), não é um PNG
 * transparente — por isso troca a imagem inteira por tema em vez de só
 * recolorir. `next-themes` aplica a classe `.dark` no `<html>`, então as
 * duas versões ficam sempre no DOM e o CSS decide qual mostrar (evita o
 * flash de logo errada que dar/`useTheme()` client-side causaria).
 */
export function SiteLogo({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <Link href="/" aria-label="3D Teu — página inicial" className="inline-flex items-center">
      <Image src="/logo-light.png" alt="3D Teu" width={547} height={141} priority className={`${className} dark:hidden`} />
      <Image
        src="/logo-dark.png"
        alt="3D Teu"
        width={574}
        height={155}
        priority
        className={`hidden ${className} dark:block`}
      />
    </Link>
  );
}
