"""Validate the whole catalogue: uv run tools/validate.py"""
import sys

import museum as m


def main():
    lines, n_probs = m.catalogue_report(m.load())
    print("\n".join(lines))
    sys.exit(1 if n_probs else 0)


if __name__ == "__main__":
    main()
