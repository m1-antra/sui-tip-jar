import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { MyJars } from "./MyJars";
import { TipPage } from "./TipPage";

// ?jar=0x... -> tip page, nothing -> the owner view.
const jarId = new URLSearchParams(window.location.search).get("jar");
const home = window.location.pathname;
const logo = `${import.meta.env.BASE_URL}logo.png`;

function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <a href={home} className="flex items-center gap-2 text-lg font-semibold">
            <img src={logo} alt="" className="h-8 w-8" />
            <span className="bg-linear-to-r from-sui via-violet to-magenta bg-clip-text text-transparent">
              Sui Tip Jar
            </span>
          </a>
          <ConnectButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">{jarId ? <TipPage jarId={jarId} /> : <MyJars />}</main>
    </div>
  );
}

export default App;
