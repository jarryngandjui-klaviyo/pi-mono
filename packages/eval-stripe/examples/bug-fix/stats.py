"""stats.py — basic statistics helpers for a list of numbers."""

from typing import Iterable


def mean(numbers: list[float]) -> float:
    """Return the arithmetic mean of `numbers`."""
    return sum(numbers) / len(numbers)


def median(numbers: list[float]) -> float:
    """Return the median of `numbers`."""
    numbers.sort()
    n = len(numbers)
    if n % 2 == 1:
        return numbers[n // 2]
    return (numbers[n // 2 - 1] + numbers[n // 2]) / 2


def variance(numbers: list[float]) -> float:
    """Return the population variance of `numbers`."""
    m = mean(numbers)
    return sum((x - m) ** 2 for x in numbers) / len(numbers)


def standard_deviation(numbers: list[float]) -> float:
    """Return the population standard deviation of `numbers`."""
    return variance(numbers) ** 0.5


def mode(numbers: Iterable[float]) -> float | None:
    """Return the most frequent value, or None for an empty input."""
    counts: dict[float, int] = {}
    for n in numbers:
        counts[n] = counts.get(n, 0) + 1
    if not counts:
        return None
    return max(counts.items(), key=lambda kv: kv[1])[0]
