import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { MyJars } from "./MyJars";
import { TipPage } from "./TipPage";

// A shared link looks like https://<site>/?jar=0x...; no jar param means the owner view.
const jarId = new URLSearchParams(window.location.search).get("jar");

function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <a href={window.location.pathname} className="text-lg font-semibold">
            Sui Tip Jar
          </a>
          <ConnectButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {jarId ? <TipPage jarId={jarId} /> : <MyJars />}
      </main>
    </div>
  );
}

export default App;
