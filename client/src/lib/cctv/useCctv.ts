import { useEffect, useState } from "react";
import { createCctvStore } from "./spacetime";
import type { CctvStore, SystemSnapshot } from "./types";

let sharedStore: CctvStore | null = null;

export function useCctv() {
  const [store] = useState(() => sharedStore ?? (sharedStore = createCctvStore()));
  const [snapshot, setSnapshot] = useState<SystemSnapshot>(() => store.getSnapshot());

  useEffect(() => store.subscribe(() => setSnapshot(store.getSnapshot())), [store]);
  return { snapshot, commands: store };
}
