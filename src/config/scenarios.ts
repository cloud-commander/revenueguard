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
    itemLabel: "Unit",
    actionLabel: "Purchased",
    valuePerUnit: 249,
    icon: Gavel,
    loadUnit: "shoppers",
    getProductName: (id) => {
      const highDemandItems = [
        "AirPods-Pro-Max",
        "Mechanical-Keyboard-RGB",
        "Ergonomic-Gaming-Chair",
        "UltraWide-4K-Monitor",
        "Noise-Canceling-Headphones",
        "Smart-Home-Hub",
        "Portable-SSD-2TB",
        "Webcam-1080p-Pro",
      ];
      const lowDemandItems = [
        "USB-C-Cable",
        "Mouse-Pad-Large",
        "Phone-Stand",
        "Laptop-Sleeve",
        "AA-Batteries-8pk",
        "HDMI-2.1-Cable",
        "Screen-Cleaner-Kit",
        "Cable-Organiser",
        "Desk-Lamp-LED",
        "Stylus-Pen",
      ];

      if (id < 8) {
        return highDemandItems[id] || `Tech-Item-${id}`;
      }
      return `${lowDemandItems[id % lowDemandItems.length]}-${id}`;
    },
    isHighDemand: (id) => id < 8,
  },
  concert: {
    id: "concert",
    name: "Ticket Exchange",
    itemLabel: "Ticket",
    actionLabel: "Booked",
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
