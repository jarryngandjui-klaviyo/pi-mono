"""test_stats.py — run with `pytest` or `python -m unittest test_stats.py`."""

import unittest

from stats import mean, median, mode, standard_deviation, variance


class TestStats(unittest.TestCase):
    def test_mean(self) -> None:
        self.assertAlmostEqual(mean([1, 2, 3, 4, 5]), 3.0)

    def test_median_odd_length(self) -> None:
        self.assertEqual(median([3, 1, 2]), 2)

    def test_median_even_length(self) -> None:
        self.assertEqual(median([4, 1, 3, 2]), 2.5)

    def test_median_does_not_mutate_input(self) -> None:
        """`median()` must not reorder the caller's list."""
        nums = [3, 1, 2]
        before = list(nums)
        median(nums)
        self.assertEqual(nums, before)

    def test_variance(self) -> None:
        self.assertAlmostEqual(variance([2, 4, 4, 4, 5, 5, 7, 9]), 4.0)

    def test_standard_deviation(self) -> None:
        self.assertAlmostEqual(standard_deviation([2, 4, 4, 4, 5, 5, 7, 9]), 2.0)

    def test_mode(self) -> None:
        self.assertEqual(mode([1, 2, 2, 3, 3, 3, 4]), 3)

    def test_mode_empty(self) -> None:
        self.assertIsNone(mode([]))


if __name__ == "__main__":
    unittest.main()
