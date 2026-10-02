"""Small, dependency-free Q-learning example for the traffic signal project.

This trainer is intentionally compact so the GitHub project can be run without
PyTorch/TensorFlow. It demonstrates how a state/action policy can learn signal
choices before being replaced by a production RL stack.
"""
from __future__ import annotations

import random
from collections import defaultdict
from dataclasses import dataclass

ACTIONS = ("HOLD", "SWITCH")
DIRECTIONS = ("North", "South", "East", "West")


@dataclass(frozen=True)
class State:
    active_idx: int
    traffic_bucket: int


def reward(queue_before: int, queue_after: int, switched: bool) -> float:
    improvement = queue_before - queue_after
    penalty = 1.5 if switched else 0.0
    return improvement - penalty


def train(episodes: int = 6000, seed: int = 7):
    rng = random.Random(seed)
    q = defaultdict(lambda: {action: 0.0 for action in ACTIONS})
    alpha, gamma, epsilon = 0.15, 0.92, 0.18

    for _ in range(episodes):
        active = rng.randrange(len(DIRECTIONS))
        traffic = rng.randint(5, 45)
        for _step in range(30):
            state = State(active, min(4, traffic // 10))
            if rng.random() < epsilon:
                action = rng.choice(ACTIONS)
            else:
                action = max(ACTIONS, key=lambda a: q[state][a])

            switched = action == "SWITCH"
            service = rng.randint(4, 10) if not switched else rng.randint(2, 6)
            arrivals = rng.randint(1, 8)
            next_traffic = max(0, traffic - service + arrivals)
            r = reward(traffic, next_traffic, switched)
            next_active = (active + 1) % len(DIRECTIONS) if switched else active
            next_state = State(next_active, min(4, next_traffic // 10))
            target = r + gamma * max(q[next_state].values())
            q[state][action] += alpha * (target - q[state][action])
            active, traffic = next_active, next_traffic
    return q


def export_policy(q, path: str = "q_policy.json") -> None:
    import json
    serialised = {
        f"{state.active_idx}:{state.traffic_bucket}": values
        for state, values in q.items()
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(serialised, f, indent=2)


if __name__ == "__main__":
    learned = train()
    export_policy(learned)
    print("Saved learned policy to q_policy.json")
