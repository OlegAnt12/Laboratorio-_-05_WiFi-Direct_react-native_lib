#!/usr/bin/env python3
import sys
import statistics

def parse(path):
    vals = []
    with open(path) as f:
        for line in f:
            line=line.strip()
            if not line or line.startswith('trial'):
                continue
            parts=line.split(',')
            if len(parts)>=2:
                try:
                    v=int(parts[1])
                    vals.append(v)
                except:
                    pass
    if not vals:
        print('No metrics found')
        return
    valid = [v for v in vals if v>=0]
    print(f'total samples: {len(vals)}')
    print(f'successful: {len(valid)}')
    if valid:
        print(f'mean: {statistics.mean(valid):.2f} ms')
        print(f'stddev: {statistics.pstdev(valid):.2f} ms')
        print(f'min: {min(valid)} ms, max: {max(valid)} ms')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: parse_metrics.py <csv_path>')
        sys.exit(1)
    parse(sys.argv[1])
