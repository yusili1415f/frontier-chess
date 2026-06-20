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
        id: "sakura_banner",
        name: "Sakura Banner",
        type: "Banner",
        timing: "passive",
        description: "Placeholder banner identity for future formation-based experiments.",
        implemented: false,
      },
      {
        id: "sakura_order",
        name: "Measured Step",
        type: "Order",
        timing: "afterEnemyMove",
        description: "Placeholder order reserved for future reaction-window tests.",
        implemented: false,
      },
      {
        id: "sakura_order_bloom",
        name: "Blooming Counter",
        type: "Relic",
        timing: "afterCapture",
        description: "Placeholder order reserved for future counterattack tests.",
        implemented: false,
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
        id: "bone_legion_banner",
        name: "Bone Legion Banner",
        type: "Banner",
        timing: "passive",
        description: "Placeholder banner identity for future attrition experiments.",
        implemented: false,
      },
      {
        id: "bone_legion_order",
        name: "March Again",
        type: "Order",
        timing: "afterCapture",
        description: "Placeholder order reserved for future capture-response tests.",
        implemented: false,
      },
      {
        id: "bone_legion_order_rattle",
        name: "Rattle the Line",
        type: "Relic",
        timing: "afterEnemyMove",
        description: "Placeholder order reserved for future enemy-move reaction tests.",
        implemented: false,
      },
    ],
  },
];
