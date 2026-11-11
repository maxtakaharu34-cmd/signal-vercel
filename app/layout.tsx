import type { Metadata } from "next";
export const metadata: Metadata = {title:"FX SIM Dashboard",description:"共通シナリオのシミュレーション画面"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
