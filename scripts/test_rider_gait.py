"""Model-level motion checks for selected riders; run via
python -m unittest discover -s scripts -p test_rider_gait.py
"""
import unittest
from rider_gait import FRAME_COUNT, phase_for, walk_poses, scooter_poses, skate_poses

class GaitTests(unittest.TestCase):
    def test_step_always_has_support_and_swing(self):
        for source in (walk_poses,skate_poses):
            frames=[source(n) for n in range(FRAME_COUNT)]
            for f in frames:
                self.assertEqual(int(f["far"].support)+int(f["near"].support),1)
            self.assertLess(min(f["far"].foot_y for f in frames),
                            max(f["far"].foot_y for f in frames)-2)
            self.assertLess(min(f["near"].foot_y for f in frames),
                            max(f["near"].foot_y for f in frames)-2)
            self.assertGreater(max(f["near"].foot_x for f in frames)-min(f["near"].foot_x for f in frames),10)
            self.assertGreater(max(f["far"].foot_x for f in frames)-min(f["far"].foot_x for f in frames),10)

    def test_walk_foot_crossing_and_y_stability(self):
        poses=[walk_poses(i) for i in range(FRAME_COUNT)]
        self.assertGreater(poses[0]["near"].foot_x,poses[0]["far"].foot_x)
        self.assertLess(poses[4]["near"].foot_x,poses[4]["far"].foot_x)
        for p in poses:
            for foot in p.values():
                if foot.support:self.assertEqual(foot.foot_y,88)
                else:self.assertLessEqual(foot.foot_y,88)
        self.assertEqual(walk_poses(0),walk_poses(8))

    def test_scooter_push_support_and_lifted_return(self):
        poses=[scooter_poses(i) for i in range(FRAME_COUNT)]
        for p in poses:
            self.assertEqual((p["near"].foot_x,p["near"].foot_y),(72,83))
            self.assertTrue(p["near"].support)
        self.assertEqual(poses[0]["far"].foot_y,89)
        self.assertEqual(poses[4]["far"].foot_y,89)
        self.assertLess(poses[6]["far"].foot_y,84)
        self.assertGreater(poses[0]["far"].foot_x - poses[4]["far"].foot_x,35)
        self.assertEqual(scooter_poses(0),scooter_poses(8))

    def test_skate_axles_follow_feet_and_no_frozen_boots(self):
        frames=[skate_poses(i) for i in range(FRAME_COUNT)]
        for name in ("far","near"):
            path={(p[name].foot_x,p[name].foot_y) for p in frames}
            self.assertGreaterEqual(len(path),7)
            for p in frames:
                axle_y=p[name].foot_y+7
                self.assertLessEqual(axle_y,93)
                self.assertGreaterEqual(axle_y,84)
        self.assertEqual(skate_poses(0),skate_poses(8))

if __name__=="__main__":
    unittest.main()
