import Image from "next/image";
import Link from "next/link";

// PNG com transparência real (não precisa mais de versão clara/escura
// separada como a logo anterior, que vinha com fundo texturizado embutido).
export function SiteLogo({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <Link href="/" aria-label="3D Teu — página inicial" className="inline-flex items-center">
      <Image src="/logo.png" alt="3D Teu" width={900} height={427} priority className={className} />
    </Link>
  );
}
