# Code to figure out which owners are still missing from players.json

import json

r1 = 0
r2 = 501
full_list = list(range(r1,r2))

with open("players.json", "r") as file:
  data = json.load(file)

x = 0
current_list = []

for item in data:
  current_list.append(data[x]["edition"])
  x += 1

missing_editions = sorted(set(full_list).difference(current_list))
print(missing_editions)