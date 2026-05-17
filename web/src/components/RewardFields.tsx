"use client";

import { useState } from "react";

type ChallengeType = "ordinary" | "multiplier" | "steal";

const INPUT_CLASS =
  "rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-zinc-600 focus:outline-none";

type Props = {
  initialType?: ChallengeType;
  initialMin?: number;
  initialMax?: number;
};

export default function RewardFields({
  initialType = "ordinary",
  initialMin = 50,
  initialMax = 50,
}: Props) {
  const [type, setType] = useState<ChallengeType>(initialType);
  const [min, setMin] = useState<number>(initialMin);
  const [max, setMax] = useState<number>(initialMax);

  // Steal and multiplier are single-value; keep min and max in lockstep.
  const handleTypeChange = (next: ChallengeType) => {
    if (next === "steal" || next === "multiplier") {
      const base = next === "multiplier" ? Math.max(2, min) : min;
      setMin(base);
      setMax(base);
    }
    setType(next);
  };

  return (
    <>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-zinc-400" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) =>
              handleTypeChange(e.target.value as ChallengeType)
            }
            className={INPUT_CLASS}
          >
            <option value="ordinary">ordinary</option>
            <option value="multiplier">multiplier</option>
            <option value="steal">steal</option>
          </select>
        </div>

        {type === "ordinary" ? (
          <>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-zinc-400" htmlFor="reward_min">
                Chips min
              </label>
              <input
                id="reward_min"
                name="reward_min"
                type="number"
                required
                min={0}
                value={min}
                onChange={(e) =>
                  setMin(Number.parseInt(e.target.value || "0", 10))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-zinc-400" htmlFor="reward_max">
                Chips max
              </label>
              <input
                id="reward_max"
                name="reward_max"
                type="number"
                required
                min={0}
                value={max}
                onChange={(e) =>
                  setMax(Number.parseInt(e.target.value || "0", 10))
                }
                className={INPUT_CLASS}
              />
            </div>
          </>
        ) : type === "multiplier" ? (
          <>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-zinc-400" htmlFor="reward_min">
                Multiplier (×N)
              </label>
              <input
                id="reward_min"
                name="reward_min"
                type="number"
                required
                min={1}
                value={min}
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value || "0", 10);
                  setMin(v);
                  setMax(v);
                }}
                className={INPUT_CLASS}
              />
            </div>
            <input type="hidden" name="reward_max" value={max} />
          </>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-zinc-400" htmlFor="reward_min">
                Steal percent (%)
              </label>
              <input
                id="reward_min"
                name="reward_min"
                type="number"
                required
                min={1}
                max={100}
                value={min}
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value || "0", 10);
                  setMin(v);
                  setMax(v);
                }}
                className={INPUT_CLASS}
              />
            </div>
            <input type="hidden" name="reward_max" value={max} />
          </>
        )}
      </div>

      <p className="-mt-1 text-[11px] text-zinc-500">
        {type === "ordinary"
          ? "Chips added to your team on success (set min = max for a fixed reward)."
          : type === "multiplier"
            ? "Your team's chips are multiplied by this factor on success."
            : "Active team picks a target on complete; target loses this percent of their chips, active team gains the same amount."}
      </p>
    </>
  );
}
