import json
import sys
import hashlib
import csv
import io

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
    
    # Read CSV file
    with open(input_file, 'r', newline='') as f:
        reader = csv.reader(f)
        header = next(reader)  # Skip header
        
        record_count = 0
        total_quantity = 0
        total_value_minor_units = 0
        minimum_transaction = float('inf')
        maximum_transaction = 0
        
        categories = {}
        accounts = {}
        
        for row in reader:
            if len(row) < 5:
                continue
            
            account_id = row[1]
            category = row[2]
            quantity = int(row[3])
            unit_price = int(row[4])
            value = quantity * unit_price
            
            record_count += 1
            total_quantity += quantity
            total_value_minor_units += value
            minimum_transaction = min(minimum_transaction, value)
            maximum_transaction = max(maximum_transaction, value)
            
            # Update categories
            if category not in categories:
                categories[category] = {'quantity': 0, 'valueMinorUnits': 0}
            categories[category]['quantity'] += quantity
            categories[category]['valueMinorUnits'] += value
            
            # Update accounts
            if account_id not in accounts:
                accounts[account_id] = 0
            accounts[account_id] += value
    
    # Sort categories alphabetically
    sorted_categories = sorted(categories.items(), key=lambda x: x[0])
    categories_list = [{'category': cat, 'quantity': data['quantity'], 'valueMinorUnits': data['valueMinorUnits']} 
                       for cat, data in sorted_categories]
    
    # Sort accounts by value descending, then by ID ascending
    sorted_accounts = sorted(accounts.items(), key=lambda x: (-x[1], x[0]))
    top_accounts = [{'accountId': acc_id, 'valueMinorUnits': value} 
                    for acc_id, value in sorted_accounts[:10]]
    
    # Calculate checksum with PascalCase keys (compact encoding to match Go's json.Encoder)
    checksum_input = json.dumps({
        'Categories': categories_list,
        'TopAccounts': top_accounts
    }, separators=(',', ':')) + '\n'
    
    checksum = hashlib.sha256(checksum_input.encode()).hexdigest()
    
    output = {
        'benchmark': 'aggregation',
        'version': 1,
        'recordCount': record_count,
        'totalQuantity': total_quantity,
        'totalValueMinorUnits': total_value_minor_units,
        'categories': categories_list,
        'topAccounts': top_accounts,
        'minimumTransactionMinorUnits': minimum_transaction,
        'maximumTransactionMinorUnits': maximum_transaction,
        'checksum': checksum
    }
    
    with open(output_file, 'w') as f:
        json.dump(output, f)

if __name__ == "__main__":
    main()
