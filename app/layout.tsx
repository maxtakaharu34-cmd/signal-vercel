import type { Metadata } from "next";
export const metadata: Metadata = {title:"FX SIM Dashboard",description:"架空の価格と残高を使用する取引画面"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
