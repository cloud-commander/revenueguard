import { Gavel, Ticket } from "lucide-react";

export interface ScenarioDef {
  id: string;
  name: string;
  itemLabel: string; // e.g. "Lot", "Seat"
  actionLabel: string; // e.g. "Bid Placed", "Booked"
  valuePerUnit: number; // £ value
  icon: any; // Lucide icon component
  loadUnit: string; // e.g. "bidders", "fans"
  getProductName: (id: number) => string;
  isHighDemand: (id: number) => boolean;
}

export const SCENARIOS: Record<string, ScenarioDef> = {
  auction: {
    id: "auction",
    name: "Online Marketplace",
    itemLabel: "Lot",
    actionLabel: "Bid Placed",
    valuePerUnit: 1250,
    icon: Gavel,
    loadUnit: "bidders",
    getProductName: (id) => {
      // First 8 = High Demand (Celebrity/Rare)
      // Rest = Standard (Stamps/Coins)
      const highDemandItems = [
        "Signed-Banksy-Print",
        "Elvis-1968-Guitar",
        "Moon-Rock-Fragment",
        "Titanic-Menu-Menu",
        "Jordan-Rookie-Card",
        "Einstein-Letter",
        "Princess-Diana-Dress",
        "Beatles-Vinyl-001",
        "SpaceX-Flown-Part",
        "Jobs-Apple-1-PC",
      ];
      const lowDemandItems = [
        "Vintage-Postage-Stamp",
        "Antique-Spoon-Set",
        "Ceramic-Figurine",
        "Old-Map-1890",
        "Silver-Coin-1922",
        "Retro-Typewriter",
        "Victorian-Brooch",
        "Fountain-Pen-1950",
        "Pocket-Watch-Broken",
        "First-Edition-Novel",
      ];

      if (id < 8) {
        return highDemandItems[id] || `Rare-Item-${id}`;
      }
      return `${lowDemandItems[id % lowDemandItems.length]}-${id}`;
    },
    isHighDemand: (id) => id < 8,
  },
  concert: {
    id: "concert",
    name: "Ticket Exchange",
    itemLabel: "Seat",
    actionLabel: "Ticket Booked",
    valuePerUnit: 185,
    icon: Ticket,
    loadUnit: "fans",
    getProductName: (id) => {
      // First 8 = Pop Star (High Demand)
      const popActs = [
        "Taylor-Swift-VIP",
        "Beyonce-Gold-Circle",
        "BTS-Soundcheck",
        "Coldplay-Zone-A",
        "Drake-FrontRow",
        "Adele-Box-Seat",
        "Ed-Sheeran-Pit",
        "Weeknd-Premium",
      ];

      // Rest = Standard/Classical (Lower Demand)
      const standardActs = [
        "Mozart-Symphony-Balcony",
        "Beethoven-Quartet-Rear",
        "Jazz-Trio-General",
        "Opera-Matinee-Side",
        "Indie-Band-Standing",
        "Folk-Festival-Lawn",
        "Blues-Night-Table",
      ];

      if (id < 8) {
        return popActs[id] || `Pop-Star-VIP-${id}`;
      }
      return `${standardActs[id % standardActs.length]}-${id}`;
    },
    isHighDemand: (id) => id < 8,
  },
};

export type ScenarioId = keyof typeof SCENARIOS;
