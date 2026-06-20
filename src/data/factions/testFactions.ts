import { Faction } from "../../engine/factions/factionTypes";

export const DEFAULT_SELECTED_FACTIONS = {
  Blue: "dragon_banner_army",
  Red: "iron_crown_cavalry",
} as const;

export const TEST_FACTIONS: readonly Faction[] = [
  {
    id: "dragon_banner_army",
    name: "Dragon Banner Army",
    shortName: "Dragon Banner",
    description: "A disciplined force built around bold advances, battlefield presence, and pressure through the center.",
    cards: [
      {
        id: "dragon_formation",
        name: "Dragon Formation",
        type: "Banner",
        timing: "beforeCombat",
        description: "Before combat, if your combat piece is adjacent to a friendly Guard, add +1 to your combat result.",
        implemented: true,
      },
      {
        id: "banner_drill",
        name: "Banner Drill",
        type: "Order",
        timing: "beforeMove",
        description: "Move a friendly Guard 1 space. If it ends adjacent to a friendly Cannon, you may move that Cannon 1 orthogonal space without capturing.",
        implemented: true,
      },
      {
        id: "guan_dao_champion",
        name: "Guan Dao Champion",
        type: "Relic",
        timing: "beforeCombat",
        description: "Before combat involving your Guard, if that Guard is adjacent to a friendly piece, add +2 to that Guard's combat result.",
        implemented: true,
      },
    ],
  },
  {
    id: "sakura_shogunate",
    name: "Sakura Shogunate",
    shortName: "Sakura",
    description: "A patient faction concept focused on formation, timing, and carefully chosen counterattacks.",
    cards: [
      {
        id: "samurai_challenge",
        name: "Samurai Challenge",
        type: "Banner",
        timing: "beforeCombat",
        description: "Before combat, if both combat pieces are not adjacent to friendly pieces, add +1 to your combat result.",
        implemented: true,
      },
      {
        id: "smoke_bomb",
        name: "Smoke Bomb",
        type: "Order",
        timing: "afterCombat",
        description: "When your Bishop would be captured, move it 1 space to an empty adjacent space if legal. The attacking piece moves into the Bishop's original space. The Bishop is not captured.",
        implemented: true,
      },
      {
        id: "last_strike",
        name: "Last Strike",
        type: "Relic",
        timing: "afterCapture",
        description: "When your Bishop or Guard is captured in combat, roll one die. On 4-6, the attacking piece is also captured.",
        implemented: true,
      },
    ],
  },
  {
    id: "iron_crown_cavalry",
    name: "Iron Crown Cavalry",
    shortName: "Iron Crown",
    description: "A mobile faction concept for future tests around tempo, cavalry pressure, and force projection.",
    cards: [
      {
        id: "lance_formation",
        name: "Lance Formation",
        type: "Banner",
        timing: "beforeCombat",
        description: "Before combat involving your attacking Knight, add +1 to that Knight's combat result if it moved this turn.",
        implemented: true,
      },
      {
        id: "breakthrough_charge",
        name: "Breakthrough Charge",
        type: "Order",
        timing: "beforeMove",
        description: "Choose one friendly Knight and move it up to its normal movement. If this movement causes combat, after seeing that Knight's combat result, you may reroll its combat die once. You must use the second result.",
        implemented: true,
      },
      {
        id: "crownbreaker_charge",
        name: "Crownbreaker Charge",
        type: "Relic",
        timing: "beforeMove",
        description: "Move one friendly Knight up to its normal movement. If it attacks this turn, add +1 to its combat result. If it wins combat, it may move 1 space after combat if legal.",
        implemented: true,
      },
    ],
  },
  {
    id: "bone_legion",
    name: "Bone Legion",
    shortName: "Bone Legion",
    description: "A resilient faction concept for future tests around attrition, sacrifice, and board-state recovery.",
    cards: [
      {
        id: "bone_sacrifice",
        name: "Bone Sacrifice",
        type: "Banner",
        timing: "beforeCombat",
        description: "Before combat, remove one friendly Pawn adjacent to your attacking piece. Add +1 to the attacker's combat result.",
        implemented: true,
      },
      {
        id: "raise_the_fallen",
        name: "Raise the Fallen",
        type: "Order",
        timing: "beforeMove",
        description: "Return one captured Pawn to an empty space in your home zone. It cannot move this turn.",
        implemented: true,
      },
      {
        id: "necromancers_bell",
        name: "Necromancer's Bell",
        type: "Relic",
        timing: "beforeMove",
        description: "Return one captured Pawn or Guard to an empty space in your home zone. It cannot move or capture this turn.",
        implemented: true,
      },
    ],
  },
];
