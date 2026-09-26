import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { AllJars } from "./AllJars";
import { MyJars } from "./MyJars";
import { TipPage } from "./TipPage";

// ?jar=0x... -> tip page, ?view=all -> every jar, nothing -> the owner view.
const params = new URLSearchParams(window.location.search);
const jarId = params.get("jar");
const showAll = params.get("view") === "all";
const home = window.location.pathname;

function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <nav className="flex items-center gap-6">
            <a href={home} className="text-lg font-semibold">
              Sui Tip Jar
            </a>
            <a href={`${home}?view=all`} className="text-sm text-muted-foreground hover:text-foreground">
              All jars
            </a>
          </nav>
          <ConnectButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {jarId ? <TipPage jarId={jarId} /> : showAll ? <AllJars /> : <MyJars />}
      </main>
    </div>
  );
}

export default App;
