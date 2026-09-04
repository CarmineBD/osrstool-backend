import { XpHour } from './types';

const TICKS_PER_HOUR = 6_000;

export interface DynamicCalculationItem {
  itemId: number;
  quantity: number | string;
}

export interface DynamicCalculationSkillXp {
  skillId: number;
  experience: number | string;
  skill?: {
    key?: string | null;
  } | null;
}

export interface DynamicCalculationAction {
  id: string;
  name: string;
  rollIntervalTicks: number;
  inputs?: DynamicCalculationItem[];
  outputs?: DynamicCalculationItem[];
  skillXp?: DynamicCalculationSkillXp[];
}

export interface DynamicCalculationStep {
  name: string;
  stepOrderPosition: number;
  durationTicks: number | null;
  clicksMade: number;
  isAfk: boolean;
  actionsMade: number | null;
}

export interface DynamicVariantCalculation {
  actionsPerHour: number;
  xpHour: XpHour;
  inputs: Array<{ id: number; quantity: number }>;
  outputs: Array<{ id: number; quantity: number }>;
  clickIntensity: number;
  afkiness: number;
  cycleTotalDurationTicks: number;
  cyclesPerHour: number;
  action: {
    id: string;
    name: string;
    rollIntervalTicks: number;
    xpGained: Array<{ skillId: number; skill: string; experience: number }>;
    inputs: Array<{ id: number; quantity: number }>;
    outputs: Array<{ id: number; quantity: number }>;
  };
  cycleSteps: Array<{
    name: string;
    stepOrderPosition: number;
    durationTicks: number;
    clicksMade: number;
    isAfk: boolean;
    actionsMade: number | null;
  }>;
}

const asFiniteNumber = (value: number | string | null | undefined): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const roundToDecimals = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const scaleItemsPerHour = (
  items: DynamicCalculationItem[],
  actionsPerHour: number,
): Array<{ id: number; quantity: number }> => {
  const totals = new Map<number, number>();
  for (const item of items) {
    const quantity = asFiniteNumber(item.quantity);
    totals.set(item.itemId, (totals.get(item.itemId) ?? 0) + quantity * actionsPerHour);
  }

  return [...totals.entries()]
    .map(([id, quantity]) => ({ id, quantity: roundToDecimals(quantity, 2) }))
    .sort((left, right) => left.id - right.id);
};

export const calculateDynamicVariant = (
  action: DynamicCalculationAction,
  steps: DynamicCalculationStep[],
): DynamicVariantCalculation => {
  const orderedSteps = [...steps].sort(
    (left, right) => left.stepOrderPosition - right.stepOrderPosition,
  );
  const rollIntervalTicks = asFiniteNumber(action.rollIntervalTicks);

  const resolvedSteps = orderedSteps.map((step) => {
    const actionsMade = step.actionsMade == null ? null : asFiniteNumber(step.actionsMade);
    const durationTicks =
      actionsMade == null ? asFiniteNumber(step.durationTicks) : actionsMade * rollIntervalTicks;

    return {
      name: step.name,
      stepOrderPosition: step.stepOrderPosition,
      durationTicks,
      clicksMade: asFiniteNumber(step.clicksMade),
      isAfk: step.isAfk,
      actionsMade,
    };
  });

  const cycleTotalDurationTicks = resolvedSteps.reduce(
    (total, step) => total + step.durationTicks,
    0,
  );
  if (cycleTotalDurationTicks <= 0) {
    throw new Error('A dynamic variant cycle must have a positive total duration');
  }

  const exactCyclesPerHour = TICKS_PER_HOUR / cycleTotalDurationTicks;
  const exactActionsPerHour =
    resolvedSteps.reduce((total, step) => total + (step.actionsMade ?? 0), 0) * exactCyclesPerHour;
  const actionsPerHour = Math.floor(exactActionsPerHour);
  const clickIntensity = Math.floor(
    resolvedSteps.reduce((total, step) => total + step.clicksMade, 0) * exactCyclesPerHour,
  );
  const afkTicks = resolvedSteps.reduce(
    (total, step) => total + (step.isAfk ? step.durationTicks : 0),
    0,
  );

  const xpBySkill = new Map<string, number>();
  const actionXp = (action.skillXp ?? []).map((entry) => {
    const skill = entry.skill?.key?.trim().toLowerCase() || String(entry.skillId);
    const experience = asFiniteNumber(entry.experience);
    xpBySkill.set(skill, (xpBySkill.get(skill) ?? 0) + experience * exactActionsPerHour);
    return {
      skillId: entry.skillId,
      skill,
      experience,
    };
  });

  const xpHour = [...xpBySkill.entries()]
    .map(([skill, experience]) => ({ skill, experience: Math.floor(experience) }))
    .sort((left, right) => left.skill.localeCompare(right.skill));

  return {
    actionsPerHour,
    xpHour,
    inputs: scaleItemsPerHour(action.inputs ?? [], exactActionsPerHour),
    outputs: scaleItemsPerHour(action.outputs ?? [], exactActionsPerHour),
    clickIntensity,
    afkiness: Math.floor((afkTicks / cycleTotalDurationTicks) * 100),
    cycleTotalDurationTicks,
    cyclesPerHour: roundToDecimals(exactCyclesPerHour, 1),
    action: {
      id: action.id,
      name: action.name,
      rollIntervalTicks: action.rollIntervalTicks,
      xpGained: actionXp,
      inputs: (action.inputs ?? []).map((input) => ({
        id: input.itemId,
        quantity: asFiniteNumber(input.quantity),
      })),
      outputs: (action.outputs ?? []).map((output) => ({
        id: output.itemId,
        quantity: asFiniteNumber(output.quantity),
      })),
    },
    cycleSteps: resolvedSteps.map((step) => ({
      ...step,
      clicksMade: Math.floor(step.clicksMade),
      actionsMade: step.actionsMade == null ? null : Math.floor(step.actionsMade),
    })),
  };
};
