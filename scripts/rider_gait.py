"""Shared physical gait curves for approved 128x100 pixel riders.

8 frames = one cycle. At any instant one foot supports on ground while the
other returns through a raised swing. Modes reuse timing, not their art.
No synthetic limb rotation in the browser; these positions are baked to PNG.
"""
from __future__ import annotations
import math
from dataclasses import dataclass

FRAME_COUNT = 8

@dataclass(frozen=True)
class Pose:
    foot_x: float
    foot_y: float
    knee_x: float
    knee_y: float
    support: bool

def phase_for(frame: int, offset: int=0) -> float:
    return ((frame + offset) % FRAME_COUNT) / FRAME_COUNT

def step_pose(frame: int, *, offset: int, hip_x: float, hip_y: float,
              center_x: float, ground_y: float, reach: float, lift: float) -> Pose:
    """Half-cycle planted from front to rear, half-cycle raised return.

    Frame 0 stance foot forward; frame 4 swing foot rear. Opposing legs are
    exactly four frames out of phase; transition boundaries remain continuous.
    """
    phase = phase_for(frame, offset)
    support = phase < 0.5
    t = phase * 2 if support else (phase - 0.5) * 2
    foot_x = center_x + reach * (1 - 2*t) if support else center_x + reach * (2*t - 1)
    foot_y = ground_y if support else ground_y - lift * math.sin(math.pi*t)
    knee_x = (hip_x + foot_x)*0.5 + (1 if support else -1)
    knee_y = hip_y + (foot_y-hip_y)*0.48 - (0 if support else 1.5*math.sin(math.pi*t))
    return Pose(foot_x,foot_y,knee_x,knee_y,support)

def walk_poses(frame: int) -> dict[str,Pose]:
    return {
        "far":step_pose(frame,offset=4,hip_x=65,hip_y=74,center_x=72,
                        ground_y=88,reach=11,lift=8),
        "near":step_pose(frame,offset=0,hip_x=79,hip_y=76,center_x=72,
                         ground_y=88,reach=11,lift=8),
    }

def scooter_poses(frame: int) -> dict[str,Pose]:
    """Front foot anchored to deck; rear foot pushes then lifts to reset."""
    phase = phase_for(frame)
    stand = Pose(72,83,69,78,True)
    if phase<0.5:
        t=phase*2
        foot_x=88-40*t              # strong backward push, reaching behind the deck
        foot_y=89
        support=True
    else:
        t=(phase-0.5)*2
        foot_x=48+40*t              # lifted recovery to next kick
        foot_y=89-8*math.sin(t*math.pi)
        support=False
    knee_x=80+(foot_x-80)*0.53
    knee_y=78+(foot_y-78)*0.38 - (0 if support else 2*math.sin(t*math.pi))
    return {"far":Pose(foot_x,foot_y,knee_x,knee_y,support),
            "near":stand}

def skate_poses(frame: int) -> dict[str,Pose]:
    """Alternating edged strides: planted skate rolls, other lifts to recover."""
    return {
        "far":step_pose(frame,offset=4,hip_x=65,hip_y=76,center_x=66,
                        ground_y=83,reach=8,lift=5),
        "near":step_pose(frame,offset=0,hip_x=81,hip_y=76,center_x=79,
                         ground_y=83,reach=9,lift=5),
    }

def poses_for(mode: str, frame: int) -> dict[str,Pose]:
    if mode=="walk":return walk_poses(frame)
    if mode=="scooter":return scooter_poses(frame)
    if mode=="skate":return skate_poses(frame)
    raise ValueError(f"unsupported movement {mode}")
