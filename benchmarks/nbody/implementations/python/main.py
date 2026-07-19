import json
import hashlib
import sys
import math

def main():
    input_file = None
    output_file = None
    
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--input":
            input_file = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--output":
            output_file = sys.argv[i + 1]
            i += 2
        else:
            i += 1
    
    if not input_file or not output_file:
        print("Usage: python main.py --input <input-file> --output <output-file>", file=sys.stderr)
        sys.exit(1)
    
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    steps = data['steps']
    delta_time = data['deltaTime']
    bodies = data['bodies']
    
    # Create mutable copies
    b = [{'mass': body['mass'], 'position': list(body['position']), 'velocity': list(body['velocity'])} for body in bodies]
    
    # Simulation loop
    for step in range(steps):
        # Velocity update
        for i in range(len(b)):
            for j in range(i + 1, len(b)):
                d = [b[j]['position'][k] - b[i]['position'][k] for k in range(3)]
                r2 = d[0]**2 + d[1]**2 + d[2]**2
                magnitude = delta_time / (r2 * math.sqrt(r2))
                for k in range(3):
                    b[i]['velocity'][k] += d[k] * b[j]['mass'] * magnitude
                    b[j]['velocity'][k] -= d[k] * b[i]['mass'] * magnitude
        
        # Position update
        for body in b:
            for k in range(3):
                body['position'][k] += delta_time * body['velocity'][k]
    
    # Energy calculation
    energy = 0.0
    for i in range(len(b)):
        v2 = sum(v**2 for v in b[i]['velocity'])
        energy += 0.5 * b[i]['mass'] * v2
        for j in range(i + 1, len(b)):
            r2 = sum((b[i]['position'][k] - b[j]['position'][k])**2 for k in range(3))
            energy -= b[i]['mass'] * b[j]['mass'] / math.sqrt(r2)
    
    # Checksum calculation
    position_data = ""
    velocity_data = ""
    for body in b:
        for k in range(3):
            position_data += f"{body['position'][k]:.9f},"
            velocity_data += f"{body['velocity'][k]:.9f},"
    
    position_checksum = hashlib.sha256(position_data.encode()).hexdigest()
    velocity_checksum = hashlib.sha256(velocity_data.encode()).hexdigest()
    
    output = {
        "benchmark": "nbody",
        "version": 1,
        "bodyCount": len(b),
        "finalEnergy": energy,
        "positionChecksum": position_checksum,
        "velocityChecksum": velocity_checksum
    }
    
    with open(output_file, 'w') as f:
        json.dump(output, f)

if __name__ == "__main__":
    main()
