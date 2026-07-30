"""
Generates the static HTML for the "Owners" section of the page from a simple players.json data file

Steps to run:
  1. open cmd and navigate to hot-drops directory
  2. run `python generate-owners.py`
  3. copy the contents of owners_block.html into index.html
"""

import json
from urllib.parse import quote

with open("players.json", "r", encoding="utf-8") as file:
  players = json.load(file)



TEMPLATE = '''            <span class="mc-render mc-font">
              <a
                class="{rank}"
                xuid="{xuid}"
                href="https://playhive.com/profile/{href_user}"
                >{username}</a>
              <span class="mc-dark-gray">[</span><span class="{rank}">{rankLetter}</span><span class="mc-dark-gray">]</span>
              <span class="mc-yellow">#{position}</span>
            </span>
'''

def render(p):
  return TEMPLATE.format(
    rank=p["rank"],
    xuid=p["xuid"],
    href_user=quote(p["username"]),
    username=p["username"],
    rankLetter=p["rankLetter"],
    position=p["position"],
  )

blocks = "\n".join(render(p) for p in players)

with open("owners_block.html", "w", encoding="utf-8") as file:
  file.write(blocks)

print(f"Generated {len(players)} player blocks -> owners_blocks.html")