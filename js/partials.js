/* =========================================================
   partials.js — loads shared header/footer markup so it only
   has to be maintained in one place (partials/header.html,
   partials/footer.html) instead of being copy-pasted into
   every page.

   Each page just needs:
     <body data-page="npc" data-root="../">
       <div data-include="header"></div>
       ...
       <div data-include="footer"></div>
     </body>

   - data-root: relative path back to the site root ("" for
     , "../" for anything in /pages/).
   - data-page: which nav item(s) should be marked active /
     current on this page. Matches the data-nav / data-topnav
     values in partials/header.html.
   ========================================================= */
(function () {
  var body = document.body;
  var root = body.getAttribute("data-root") || "";
  var page = body.getAttribute("data-page") || "";

  function applyRoot(html) {
    return html.split("{{root}}").join(root);
  }

  function markActive(container) {
    if (!page) return;
    var topLink = container.querySelector('[data-topnav="' + page + '"]');
    if (topLink) topLink.classList.add("active");
    var sideLink = container.querySelector('[data-nav="' + page + '"]');
    if (sideLink) sideLink.classList.add("current");
  }

  function wireDropdown(container) {
    var btn = container.querySelector("#navToggle");
    var menu = container.querySelector("#navDropdown");
    if (!btn || !menu) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = menu.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        menu.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* =========================================================
     Search index — one entry per real page/section on the wiki.
     "url" uses {{root}} the same way partials do; "#" means the
     page doesn't exist yet. Add an entry here any time a new
     page is added to the wiki.
     ========================================================= */
  var SEARCH_INDEX = [
    {
      title: "Main Page",
      url: "{{root}}",
      category: "Navigation",
      keywords: "home main hive wiki overview",
    },
    {
      title: "BedWars",
      url: "#",
      category: "Games",
      keywords: "bedwars team pvp bed defend",
    },
    {
      title: "SkyWars",
      url: "#",
      category: "Games",
      keywords: "skywars party game island loot",
    },
    {
      title: "Survival Games",
      url: "#",
      category: "Games",
      keywords: "survival games battle royale deathmatch tribute",
    },
    {
      title: "Murder Mystery",
      url: "#",
      category: "Games",
      keywords: "murder mystery social deduction sheriff innocents",
    },
    {
      title: "Ground Wars",
      url: "#",
      category: "Games",
      keywords: "ground wars team pvp eggs defenses",
    },
    {
      title: "Hide and Seek",
      url: "#",
      category: "Games",
      keywords: "hide and seek disguise block seeker",
    },
    {
      title: "Ranks & Perks",
      url: "#",
      category: "Navigation",
      keywords: "ranks perks vip mvp",
    },
    {
      title: "Costumes",
      url: "{{root}}costumes/",
      category: "Navigation",
      keywords: "costumes cosmetics store bundles",
    },
    {
      title: "Store",
      url: "{{root}}store/",
      category: "Navigation",
      keywords: "store cosmetic locker browse items",
    },
    {
      title: "Black Friday Bundle",
      url: "{{root}}bundles/black-friday-bundle/",
      category: "Costumes / Bundles",
      keywords: "black friday bundle dog onesie ginger cat sharky turtle",
    },
    {
      title: "Summer Bonanza Bundle",
      url: "{{root}}bundles/summer-bonanza/",
      category: "Costumes / Bundles",
      keywords: "summer bonanza bundle",
    },
    {
      title: "Pirate Costume",
      url: "{{root}}costumes/misc/pirate/",
      category: "Costumes / Misc",
      keywords: "pirate costume misc",
    },
    {
      title: "Skeleton Costume",
      url: "{{root}}costumes/misc/skeleton/",
      category: "Costumes / Misc",
      keywords: "skeleton costume misc",
    },
    {
      title: "Skelly Banana Costume",
      url: "{{root}}costumes/misc/skelly-banana/",
      category: "Costumes / Misc",
      keywords: "skelly banana costume misc",
    },
    {
      title: "Cacti Bandit Costume",
      url: "{{root}}costumes/quest/cacti-bandit/",
      category: "Costumes / Quest",
      keywords: "cacti bandit quest costume",
    },
    {
      title: "Abyssal Angler Costume",
      url: "{{root}}costumes/store/abyssal-angler/",
      category: "Costumes / Store",
      keywords: "abyssal angler costume cosmetic store",
    },
    {
      title: "Archy Costume",
      url: "{{root}}costumes/store/archy/",
      category: "Costumes / Store",
      keywords: "archy costume cosmetic store",
    },
    {
      title: "Axolotl Costume",
      url: "{{root}}costumes/store/axolotl/",
      category: "Costumes / Store",
      keywords: "axolotl costume cosmetic store",
    },
    {
      title: "Bamboo Bandit Costume",
      url: "{{root}}costumes/store/bamboo-bandit/",
      category: "Costumes / Store",
      keywords: "bamboo bandit costume cosmetic store",
    },
    {
      title: "Banana Costume",
      url: "{{root}}costumes/store/banana/",
      category: "Costumes / Store",
      keywords: "banana costume cosmetic store",
    },
    {
      title: "Bandit Costume",
      url: "{{root}}costumes/store/bandit/",
      category: "Costumes / Store",
      keywords: "bandit costume cosmetic store",
    },
    {
      title: "Battle Biscuit Costume",
      url: "{{root}}costumes/store/battle-biscuit/",
      category: "Costumes / Store",
      keywords: "battle biscuit costume cosmetic store",
    },
    {
      title: "Battle Burger Costume",
      url: "{{root}}costumes/store/battle-burger/",
      category: "Costumes / Store",
      keywords: "battle burger costume cosmetic store",
    },
    {
      title: "Battle Cat Costume",
      url: "{{root}}costumes/store/battle-cat/",
      category: "Costumes / Store",
      keywords: "battle cat costume cosmetic store",
    },
    {
      title: "Battle Unicorn Costume",
      url: "{{root}}costumes/store/battle-unicorn/",
      category: "Costumes / Store",
      keywords: "battle unicorn costume cosmetic store",
    },
    {
      title: "Beach Monkey Costume",
      url: "{{root}}costumes/store/beach-monkey/",
      category: "Costumes / Store",
      keywords: "beach monkey costume cosmetic store",
    },
    {
      title: "Bear Costume",
      url: "{{root}}costumes/store/bear/",
      category: "Costumes / Store",
      keywords: "bear costume cosmetic store",
    },
    {
      title: "Beepo Costume",
      url: "{{root}}costumes/store/beepo/",
      category: "Costumes / Store",
      keywords: "beepo costume cosmetic store",
    },
    {
      title: "Billy Costume",
      url: "{{root}}costumes/store/billy/",
      category: "Costumes / Store",
      keywords: "billy costume cosmetic store",
    },
    {
      title: "Black Knight Costume",
      url: "{{root}}costumes/store/black-knight/",
      category: "Costumes / Store",
      keywords: "black knight costume cosmetic store",
    },
    {
      title: "Blink Costume",
      url: "{{root}}costumes/store/blink/",
      category: "Costumes / Store",
      keywords: "blink costume cosmetic store",
    },
    {
      title: "Bunny Mage Costume",
      url: "{{root}}costumes/store/bunny-mage/",
      category: "Costumes / Store",
      keywords: "bunny mage costume cosmetic store",
    },
    {
      title: "Burger Costume",
      url: "{{root}}costumes/store/burger/",
      category: "Costumes / Store",
      keywords: "burger costume cosmetic store",
    },
    {
      title: "Burger Gold Edition Costume",
      url: "{{root}}costumes/store/burger-gold-edition/",
      category: "Costumes / Store",
      keywords: "burger gold edition costume cosmetic store",
    },
    {
      title: "Burple Costume",
      url: "{{root}}costumes/store/burple/",
      category: "Costumes / Store",
      keywords: "burple costume cosmetic store",
    },
    {
      title: "Cactus Costume",
      url: "{{root}}costumes/store/cactus/",
      category: "Costumes / Store",
      keywords: "cactus costume cosmetic store",
    },
    {
      title: "Calico Costume",
      url: "{{root}}costumes/store/calico/",
      category: "Costumes / Store",
      keywords: "calico costume cosmetic store",
    },
    {
      title: "Camella Costume",
      url: "{{root}}costumes/store/camella/",
      category: "Costumes / Store",
      keywords: "camella costume cosmetic store",
    },
    {
      title: "Cammy Costume",
      url: "{{root}}costumes/store/cammy/",
      category: "Costumes / Store",
      keywords: "cammy costume cosmetic store",
    },
    {
      title: "Captain Bones Costume",
      url: "{{root}}costumes/store/captain-bones/",
      category: "Costumes / Store",
      keywords: "captain bones costume cosmetic store",
    },
    {
      title: "Captain Fox Costume",
      url: "{{root}}costumes/store/captain-fox/",
      category: "Costumes / Store",
      keywords: "captain fox costume cosmetic store",
    },
    {
      title: "Captain Octopus Costume",
      url: "{{root}}costumes/store/captain-octopus/",
      category: "Costumes / Store",
      keywords: "captain octopus costume cosmetic store",
    },
    {
      title: "Carrot Costume",
      url: "{{root}}costumes/store/carrot/",
      category: "Costumes / Store",
      keywords: "carrot costume cosmetic store",
    },
    {
      title: "Catbot Costume",
      url: "{{root}}costumes/store/catbot/",
      category: "Costumes / Store",
      keywords: "catbot costume cosmetic store",
    },
    {
      title: "Catbox Costume",
      url: "{{root}}costumes/store/catbox/",
      category: "Costumes / Store",
      keywords: "catbox costume cosmetic store",
    },
    {
      title: "Chicken Costume",
      url: "{{root}}costumes/store/chicken/",
      category: "Costumes / Store",
      keywords: "chicken costume cosmetic store",
    },
    {
      title: "Chillager Costume",
      url: "{{root}}costumes/store/chillager/",
      category: "Costumes / Store",
      keywords: "chillager costume cosmetic store",
    },
    {
      title: "Chocolate Costume",
      url: "{{root}}costumes/store/chocolate/",
      category: "Costumes / Store",
      keywords: "chocolate costume cosmetic store",
    },
    {
      title: "Christmas Creeper Costume",
      url: "{{root}}costumes/store/christmas-creeper/",
      category: "Costumes / Store",
      keywords: "christmas creeper costume cosmetic store",
    },
    {
      title: "Circuit Costume",
      url: "{{root}}costumes/store/circuit/",
      category: "Costumes / Store",
      keywords: "circuit costume cosmetic store",
    },
    {
      title: "Cloak Costume",
      url: "{{root}}costumes/store/cloak/",
      category: "Costumes / Store",
      keywords: "cloak costume cosmetic store",
    },
    {
      title: "Clown Costume",
      url: "{{root}}costumes/store/clown/",
      category: "Costumes / Store",
      keywords: "clown costume cosmetic store",
    },
    {
      title: "Cool Cream Costume",
      url: "{{root}}costumes/store/cool-cream/",
      category: "Costumes / Store",
      keywords: "cool cream costume cosmetic store",
    },
    {
      title: "Cool Goose Costume",
      url: "{{root}}costumes/store/cool-goose/",
      category: "Costumes / Store",
      keywords: "cool goose costume cosmetic store",
    },
    {
      title: "Coolconut Costume",
      url: "{{root}}costumes/store/coolconut/",
      category: "Costumes / Store",
      keywords: "coolconut costume cosmetic store",
    },
    {
      title: "Coral Queen Costume",
      url: "{{root}}costumes/store/coral-queen/",
      category: "Costumes / Store",
      keywords: "coral queen costume cosmetic store",
    },
    {
      title: "Corn Costume",
      url: "{{root}}costumes/store/corn/",
      category: "Costumes / Store",
      keywords: "corn costume cosmetic store",
    },
    {
      title: "Cosmic Knight Costume",
      url: "{{root}}costumes/store/cosmic-knight/",
      category: "Costumes / Store",
      keywords: "cosmic knight costume cosmetic store",
    },
    {
      title: "Croc Costume",
      url: "{{root}}costumes/store/croc/",
      category: "Costumes / Store",
      keywords: "croc costume cosmetic store",
    },
    {
      title: "Cuddles Costume",
      url: "{{root}}costumes/store/cuddles/",
      category: "Costumes / Store",
      keywords: "cuddles costume cosmetic store",
    },
    {
      title: "Cupcake Costume",
      url: "{{root}}costumes/store/cupcake/",
      category: "Costumes / Store",
      keywords: "cupcake costume cosmetic store",
    },
    {
      title: "Cupid Squad Leader Costume",
      url: "{{root}}costumes/store/cupid-squad-leader/",
      category: "Costumes / Store",
      keywords: "cupid squad leader costume cosmetic store",
    },
    {
      title: "Cursed Oak Costume",
      url: "{{root}}costumes/store/cursed-oak/",
      category: "Costumes / Store",
      keywords: "cursed oak costume cosmetic store",
    },
    {
      title: "Dark Elf Costume",
      url: "{{root}}costumes/store/dark-elf/",
      category: "Costumes / Store",
      keywords: "dark elf costume cosmetic store",
    },
    {
      title: "Dark Wraith Costume",
      url: "{{root}}costumes/store/dark-wraith/",
      category: "Costumes / Store",
      keywords: "dark wraith costume cosmetic store",
    },
    {
      title: "Deer Costume",
      url: "{{root}}costumes/store/deer/",
      category: "Costumes / Store",
      keywords: "deer costume cosmetic store",
    },
    {
      title: "Detective Platypus Costume",
      url: "{{root}}costumes/store/detective-platypus/",
      category: "Costumes / Store",
      keywords: "detective platypus costume cosmetic store",
    },
    {
      title: "Detective Sloth Costume",
      url: "{{root}}costumes/store/detective-sloth/",
      category: "Costumes / Store",
      keywords: "detective sloth costume cosmetic store",
    },
    {
      title: "Dino Costume",
      url: "{{root}}costumes/store/dino/",
      category: "Costumes / Store",
      keywords: "dino costume cosmetic store",
    },
    {
      title: "Dinoroar Costume",
      url: "{{root}}costumes/store/dinoroar/",
      category: "Costumes / Store",
      keywords: "dinoroar costume cosmetic store",
    },
    {
      title: "Doge Costume",
      url: "{{root}}costumes/store/doge/",
      category: "Costumes / Store",
      keywords: "doge costume cosmetic store",
    },
    {
      title: "Dolphin Costume",
      url: "{{root}}costumes/store/dolphin/",
      category: "Costumes / Store",
      keywords: "dolphin costume cosmetic store",
    },
    {
      title: "Donut Costume",
      url: "{{root}}costumes/store/donut/",
      category: "Costumes / Store",
      keywords: "donut costume cosmetic store",
    },
    {
      title: "Doomsday Costume",
      url: "{{root}}costumes/store/doomsday/",
      category: "Costumes / Store",
      keywords: "doomsday costume cosmetic store",
    },
    {
      title: "Dragon Costume",
      url: "{{root}}costumes/store/dragon/",
      category: "Costumes / Store",
      keywords: "dragon costume cosmetic store",
    },
    {
      title: "Dread Costume",
      url: "{{root}}costumes/store/dread/",
      category: "Costumes / Store",
      keywords: "dread costume cosmetic store",
    },
    {
      title: "Ducky Costume",
      url: "{{root}}costumes/store/ducky/",
      category: "Costumes / Store",
      keywords: "ducky costume cosmetic store",
    },
    {
      title: "Elephant Costume",
      url: "{{root}}costumes/store/elephant/",
      category: "Costumes / Store",
      keywords: "elephant costume cosmetic store",
    },
    {
      title: "End Assassin Costume",
      url: "{{root}}costumes/store/end-assassin/",
      category: "Costumes / Store",
      keywords: "end assassin costume cosmetic store",
    },
    {
      title: "End Crystal Costume",
      url: "{{root}}costumes/store/end-crystal/",
      category: "Costumes / Store",
      keywords: "end crystal costume cosmetic store",
    },
    {
      title: "Enderfox Costume",
      url: "{{root}}costumes/store/enderfox/",
      category: "Costumes / Store",
      keywords: "enderfox costume cosmetic store",
    },
    {
      title: "Endersaur Costume",
      url: "{{root}}costumes/store/endersaur/",
      category: "Costumes / Store",
      keywords: "endersaur costume cosmetic store",
    },
    {
      title: "Endolotl Costume",
      url: "{{root}}costumes/store/endolotl/",
      category: "Costumes / Store",
      keywords: "endolotl costume cosmetic store",
    },
    {
      title: "Fineapple Costume",
      url: "{{root}}costumes/store/fineapple/",
      category: "Costumes / Store",
      keywords: "fineapple costume cosmetic store",
    },
    {
      title: "Fire Dragon Costume",
      url: "{{root}}costumes/store/fire-dragon/",
      category: "Costumes / Store",
      keywords: "fire dragon costume cosmetic store",
    },
    {
      title: "Fire Queen Costume",
      url: "{{root}}costumes/store/fire-queen/",
      category: "Costumes / Store",
      keywords: "fire queen costume cosmetic store",
    },
    {
      title: "Flame Costume",
      url: "{{root}}costumes/store/flame/",
      category: "Costumes / Store",
      keywords: "flame costume cosmetic store",
    },
    {
      title: "Flowerlotl Costume",
      url: "{{root}}costumes/store/flowerlotl/",
      category: "Costumes / Store",
      keywords: "flowerlotl costume cosmetic store",
    },
    {
      title: "Fox Costume",
      url: "{{root}}costumes/store/fox/",
      category: "Costumes / Store",
      keywords: "fox costume cosmetic store",
    },
    {
      title: "Friender Dragon Costume",
      url: "{{root}}costumes/store/friender-dragon/",
      category: "Costumes / Store",
      keywords: "friender dragon costume cosmetic store",
    },
    {
      title: "Friendly Dragon Costume",
      url: "{{root}}costumes/store/friendly-dragon/",
      category: "Costumes / Store",
      keywords: "friendly dragon costume cosmetic store",
    },
    {
      title: "Froag Costume",
      url: "{{root}}costumes/store/froag/",
      category: "Costumes / Store",
      keywords: "froag costume cosmetic store",
    },
    {
      title: "Frost Banana Costume",
      url: "{{root}}costumes/store/frost-banana/",
      category: "Costumes / Store",
      keywords: "frost banana costume cosmetic store",
    },
    {
      title: "Frost Bee Costume",
      url: "{{root}}costumes/store/frost-bee/",
      category: "Costumes / Store",
      keywords: "frost bee costume cosmetic store",
    },
    {
      title: "Frost Kitsune Costume",
      url: "{{root}}costumes/store/frost-kitsune/",
      category: "Costumes / Store",
      keywords: "frost kitsune costume cosmetic store",
    },
    {
      title: "Frost Moose Costume",
      url: "{{root}}costumes/store/frost-moose/",
      category: "Costumes / Store",
      keywords: "frost moose costume cosmetic store",
    },
    {
      title: "Galaxy Costume",
      url: "{{root}}costumes/store/galaxy/",
      category: "Costumes / Store",
      keywords: "galaxy costume cosmetic store",
    },
    {
      title: "Gargoyle Costume",
      url: "{{root}}costumes/store/gargoyle/",
      category: "Costumes / Store",
      keywords: "gargoyle costume cosmetic store",
    },
    {
      title: "Genie Costume",
      url: "{{root}}costumes/store/genie/",
      category: "Costumes / Store",
      keywords: "genie costume cosmetic store",
    },
    {
      title: "Ghosty Costume",
      url: "{{root}}costumes/store/ghosty/",
      category: "Costumes / Store",
      keywords: "ghosty costume cosmetic store",
    },
    {
      title: "Ginger Costume",
      url: "{{root}}costumes/store/ginger/",
      category: "Costumes / Store",
      keywords: "ginger costume cosmetic store",
    },
    {
      title: "Ginger Cat Costume",
      url: "{{root}}costumes/store/ginger-cat/",
      category: "Costumes / Store",
      keywords: "ginger cat costume cosmetic store",
    },
    {
      title: "Giraffe Costume",
      url: "{{root}}costumes/store/giraffe/",
      category: "Costumes / Store",
      keywords: "giraffe costume cosmetic store",
    },
    {
      title: "Globey Costume",
      url: "{{root}}costumes/store/globey/",
      category: "Costumes / Store",
      keywords: "globey costume cosmetic store",
    },
    {
      title: "Gloomy Costume",
      url: "{{root}}costumes/store/gloomy/",
      category: "Costumes / Store",
      keywords: "gloomy costume cosmetic store",
    },
    {
      title: "Glowbot Costume",
      url: "{{root}}costumes/store/glowbot/",
      category: "Costumes / Store",
      keywords: "glowbot costume cosmetic store",
    },
    {
      title: "Gnome Costume",
      url: "{{root}}costumes/store/gnome/",
      category: "Costumes / Store",
      keywords: "gnome costume cosmetic store",
    },
    {
      title: "Goddess of Night Costume",
      url: "{{root}}costumes/store/goddess-of-night/",
      category: "Costumes / Store",
      keywords: "goddess of night costume cosmetic store",
    },
    {
      title: "Golden Dragon Costume",
      url: "{{root}}costumes/store/golden-dragon/",
      category: "Costumes / Store",
      keywords: "golden dragon costume cosmetic store",
    },
    {
      title: "Golden Skull Costume",
      url: "{{root}}costumes/store/golden-skull/",
      category: "Costumes / Store",
      keywords: "golden skull costume cosmetic store",
    },
    {
      title: "Goldfish Costume",
      url: "{{root}}costumes/store/goldfish/",
      category: "Costumes / Store",
      keywords: "goldfish costume cosmetic store",
    },
    {
      title: "Gremlin Costume",
      url: "{{root}}costumes/store/gremlin/",
      category: "Costumes / Store",
      keywords: "gremlin costume cosmetic store",
    },
    {
      title: "Grim Creeper Costume",
      url: "{{root}}costumes/store/grim-creeper/",
      category: "Costumes / Store",
      keywords: "grim creeper costume cosmetic store",
    },
    {
      title: "Guardian Warrior Costume",
      url: "{{root}}costumes/store/guardian-warrior/",
      category: "Costumes / Store",
      keywords: "guardian warrior costume cosmetic store",
    },
    {
      title: "Hazmat Costume",
      url: "{{root}}costumes/store/hazmat/",
      category: "Costumes / Store",
      keywords: "hazmat costume cosmetic store",
    },
    {
      title: "Hip Hop Costume",
      url: "{{root}}costumes/store/hip-hop/",
      category: "Costumes / Store",
      keywords: "hip hop costume cosmetic store",
    },
    {
      title: "Hongo Costume",
      url: "{{root}}costumes/store/hongo/",
      category: "Costumes / Store",
      keywords: "hongo costume cosmetic store",
    },
    {
      title: "Honk Costume",
      url: "{{root}}costumes/store/honk/",
      category: "Costumes / Store",
      keywords: "honk costume cosmetic store",
    },
    {
      title: "Hoodie Duck Costume",
      url: "{{root}}costumes/store/hoodie-duck/",
      category: "Costumes / Store",
      keywords: "hoodie duck costume cosmetic store",
    },
    {
      title: "Hoodie Pig Costume",
      url: "{{root}}costumes/store/hoodie-pig/",
      category: "Costumes / Store",
      keywords: "hoodie pig costume cosmetic store",
    },
    {
      title: "Hoodie Pug Costume",
      url: "{{root}}costumes/store/hoodie-pug/",
      category: "Costumes / Store",
      keywords: "hoodie pug costume cosmetic store",
    },
    {
      title: "Hoodie Wolf Costume",
      url: "{{root}}costumes/store/hoodie-wolf/",
      category: "Costumes / Store",
      keywords: "hoodie wolf costume cosmetic store",
    },
    {
      title: "Hoppy Costume",
      url: "{{root}}costumes/store/hoppy/",
      category: "Costumes / Store",
      keywords: "hoppy costume cosmetic store",
    },
    {
      title: "Hotdog Costume",
      url: "{{root}}costumes/store/hotdog/",
      category: "Costumes / Store",
      keywords: "hotdog costume cosmetic store",
    },
    {
      title: "Ice Dragon Costume",
      url: "{{root}}costumes/store/ice-dragon/",
      category: "Costumes / Store",
      keywords: "ice dragon costume cosmetic store",
    },
    {
      title: "Ice King Costume",
      url: "{{root}}costumes/store/ice-king/",
      category: "Costumes / Store",
      keywords: "ice king costume cosmetic store",
    },
    {
      title: "Ice Mammoth Costume",
      url: "{{root}}costumes/store/ice-mammoth/",
      category: "Costumes / Store",
      keywords: "ice mammoth costume cosmetic store",
    },
    {
      title: "Ice Queen Costume",
      url: "{{root}}costumes/store/ice-queen/",
      category: "Costumes / Store",
      keywords: "ice queen costume cosmetic store",
    },
    {
      title: "Ice Summoner Costume",
      url: "{{root}}costumes/store/ice-summoner/",
      category: "Costumes / Store",
      keywords: "ice summoner costume cosmetic store",
    },
    {
      title: "Icebloom Costume",
      url: "{{root}}costumes/store/icebloom/",
      category: "Costumes / Store",
      keywords: "icebloom costume cosmetic store",
    },
    {
      title: "Icecap Shroomy Costume",
      url: "{{root}}costumes/store/icecap-shroomy/",
      category: "Costumes / Store",
      keywords: "icecap shroomy costume cosmetic store",
    },
    {
      title: "Icedeer Costume",
      url: "{{root}}costumes/store/icedeer/",
      category: "Costumes / Store",
      keywords: "icedeer costume cosmetic store",
    },
    {
      title: "Iceolotl Costume",
      url: "{{root}}costumes/store/iceolotl/",
      category: "Costumes / Store",
      keywords: "iceolotl costume cosmetic store",
    },
    {
      title: "Inferno Costume",
      url: "{{root}}costumes/store/inferno/",
      category: "Costumes / Store",
      keywords: "inferno costume cosmetic store",
    },
    {
      title: "Inky Costume",
      url: "{{root}}costumes/store/inky/",
      category: "Costumes / Store",
      keywords: "inky costume cosmetic store",
    },
    {
      title: "Jade Queen Costume",
      url: "{{root}}costumes/store/jade-queen/",
      category: "Costumes / Store",
      keywords: "jade queen costume cosmetic store",
    },
    {
      title: "Jellyfish Costume",
      url: "{{root}}costumes/store/jellyfish/",
      category: "Costumes / Store",
      keywords: "jellyfish costume cosmetic store",
    },
    {
      title: "Juicy Costume",
      url: "{{root}}costumes/store/juicy/",
      category: "Costumes / Store",
      keywords: "juicy costume cosmetic store",
    },
    {
      title: "Kitsune Costume",
      url: "{{root}}costumes/store/kitsune/",
      category: "Costumes / Store",
      keywords: "kitsune costume cosmetic store",
    },
    {
      title: "Koala Costume",
      url: "{{root}}costumes/store/koala/",
      category: "Costumes / Store",
      keywords: "koala costume cosmetic store",
    },
    {
      title: "Koala Knight Costume",
      url: "{{root}}costumes/store/koala-knight/",
      category: "Costumes / Store",
      keywords: "koala knight costume cosmetic store",
    },
    {
      title: "Koffee Costume",
      url: "{{root}}costumes/store/koffee/",
      category: "Costumes / Store",
      keywords: "koffee costume cosmetic store",
    },
    {
      title: "Laser Shark Costume",
      url: "{{root}}costumes/store/laser-shark/",
      category: "Costumes / Store",
      keywords: "laser shark costume cosmetic store",
    },
    {
      title: "Lava Golem Costume",
      url: "{{root}}costumes/store/lava-golem/",
      category: "Costumes / Store",
      keywords: "lava golem costume cosmetic store",
    },
    {
      title: "Leaf Costume",
      url: "{{root}}costumes/store/leaf/",
      category: "Costumes / Store",
      keywords: "leaf costume cosmetic store",
    },
    {
      title: "Leopard Costume",
      url: "{{root}}costumes/store/leopard/",
      category: "Costumes / Store",
      keywords: "leopard costume cosmetic store",
    },
    {
      title: "Leprechaun Costume",
      url: "{{root}}costumes/store/leprechaun/",
      category: "Costumes / Store",
      keywords: "leprechaun costume cosmetic store",
    },
    {
      title: "Lion Costume",
      url: "{{root}}costumes/store/lion/",
      category: "Costumes / Store",
      keywords: "lion costume cosmetic store",
    },
    {
      title: "Llama Costume",
      url: "{{root}}costumes/store/llama/",
      category: "Costumes / Store",
      keywords: "llama costume cosmetic store",
    },
    {
      title: "Lunar Red Panda Costume",
      url: "{{root}}costumes/store/lunar-red-panda/",
      category: "Costumes / Store",
      keywords: "lunar red panda costume cosmetic store",
    },
    {
      title: "Mage Costume",
      url: "{{root}}costumes/store/mage/",
      category: "Costumes / Store",
      keywords: "mage costume cosmetic store",
    },
    {
      title: "Mageolotl Costume",
      url: "{{root}}costumes/store/mageolotl/",
      category: "Costumes / Store",
      keywords: "mageolotl costume cosmetic store",
    },
    {
      title: "Magma Dragon Costume",
      url: "{{root}}costumes/store/magma-dragon/",
      category: "Costumes / Store",
      keywords: "magma dragon costume cosmetic store",
    },
    {
      title: "Medusa Costume",
      url: "{{root}}costumes/store/medusa/",
      category: "Costumes / Store",
      keywords: "medusa costume cosmetic store",
    },
    {
      title: "Meerkat Ranger Costume",
      url: "{{root}}costumes/store/meerkat-ranger/",
      category: "Costumes / Store",
      keywords: "meerkat ranger costume cosmetic store",
    },
    {
      title: "Miner Pig Costume",
      url: "{{root}}costumes/store/miner-pig/",
      category: "Costumes / Store",
      keywords: "miner pig costume cosmetic store",
    },
    {
      title: "Miss Bunny Costume",
      url: "{{root}}costumes/store/miss-bunny/",
      category: "Costumes / Store",
      keywords: "miss bunny costume cosmetic store",
    },
    {
      title: "Moo Costume",
      url: "{{root}}costumes/store/moo/",
      category: "Costumes / Store",
      keywords: "moo costume cosmetic store",
    },
    {
      title: "Mr Grump Costume",
      url: "{{root}}costumes/store/mr-grump/",
      category: "Costumes / Store",
      keywords: "mr grump costume cosmetic store",
    },
    {
      title: "Mr Pickles Costume",
      url: "{{root}}costumes/store/mr-pickles/",
      category: "Costumes / Store",
      keywords: "mr pickles costume cosmetic store",
    },
    {
      title: "Muddy Pig Costume",
      url: "{{root}}costumes/store/muddy-pig/",
      category: "Costumes / Store",
      keywords: "muddy pig costume cosmetic store",
    },
    {
      title: "Narwhal Costume",
      url: "{{root}}costumes/store/narwhal/",
      category: "Costumes / Store",
      keywords: "narwhal costume cosmetic store",
    },
    {
      title: "Nether Skull Costume",
      url: "{{root}}costumes/store/nether-skull/",
      category: "Costumes / Store",
      keywords: "nether skull costume cosmetic store",
    },
    {
      title: "Night Crow Costume",
      url: "{{root}}costumes/store/night-crow/",
      category: "Costumes / Store",
      keywords: "night crow costume cosmetic store",
    },
    {
      title: "Night Stalker Costume",
      url: "{{root}}costumes/store/night-stalker/",
      category: "Costumes / Store",
      keywords: "night stalker costume cosmetic store",
    },
    {
      title: "Night Star Costume",
      url: "{{root}}costumes/store/night-star/",
      category: "Costumes / Store",
      keywords: "night star costume cosmetic store",
    },
    {
      title: "Officer 11 Costume",
      url: "{{root}}costumes/store/officer-11/",
      category: "Costumes / Store",
      keywords: "officer 11 costume cosmetic store",
    },
    {
      title: "Old Town Horse Costume",
      url: "{{root}}costumes/store/old-town-horse/",
      category: "Costumes / Store",
      keywords: "old town horse costume cosmetic store",
    },
    {
      title: "Orange Juice Costume",
      url: "{{root}}costumes/store/orange-juice/",
      category: "Costumes / Store",
      keywords: "orange juice costume cosmetic store",
    },
    {
      title: "Orbit Costume",
      url: "{{root}}costumes/store/orbit/",
      category: "Costumes / Store",
      keywords: "orbit costume cosmetic store",
    },
    {
      title: "Otto Costume",
      url: "{{root}}costumes/store/otto/",
      category: "Costumes / Store",
      keywords: "otto costume cosmetic store",
    },
    {
      title: "Owl Costume",
      url: "{{root}}costumes/store/owl/",
      category: "Costumes / Store",
      keywords: "owl costume cosmetic store",
    },
    {
      title: "Panda Costume",
      url: "{{root}}costumes/store/panda/",
      category: "Costumes / Store",
      keywords: "panda costume cosmetic store",
    },
    {
      title: "Parrot Costume",
      url: "{{root}}costumes/store/parrot/",
      category: "Costumes / Store",
      keywords: "parrot costume cosmetic store",
    },
    {
      title: "Paws Costume",
      url: "{{root}}costumes/store/paws/",
      category: "Costumes / Store",
      keywords: "paws costume cosmetic store",
    },
    {
      title: "Penguin Costume",
      url: "{{root}}costumes/store/penguin/",
      category: "Costumes / Store",
      keywords: "penguin costume cosmetic store",
    },
    {
      title: "Phoenix Costume",
      url: "{{root}}costumes/store/phoenix/",
      category: "Costumes / Store",
      keywords: "phoenix costume cosmetic store",
    },
    {
      title: "Piggy Costume",
      url: "{{root}}costumes/store/piggy/",
      category: "Costumes / Store",
      keywords: "piggy costume cosmetic store",
    },
    {
      title: "Pinata Llama Costume",
      url: "{{root}}costumes/store/pinata-llama/",
      category: "Costumes / Store",
      keywords: "pinata llama costume cosmetic store",
    },
    {
      title: "Pizza Time Costume",
      url: "{{root}}costumes/store/pizza-time/",
      category: "Costumes / Store",
      keywords: "pizza time costume cosmetic store",
    },
    {
      title: "Plague Doctor Costume",
      url: "{{root}}costumes/store/plague-doctor/",
      category: "Costumes / Store",
      keywords: "plague doctor costume cosmetic store",
    },
    {
      title: "Potter Costume",
      url: "{{root}}costumes/store/potter/",
      category: "Costumes / Store",
      keywords: "potter costume cosmetic store",
    },
    {
      title: "Pumpkin Lord Costume",
      url: "{{root}}costumes/store/pumpkin-lord/",
      category: "Costumes / Store",
      keywords: "pumpkin lord costume cosmetic store",
    },
    {
      title: "Pumpkin Paladin Costume",
      url: "{{root}}costumes/store/pumpkin-paladin/",
      category: "Costumes / Store",
      keywords: "pumpkin paladin costume cosmetic store",
    },
    {
      title: "Punch Costume",
      url: "{{root}}costumes/store/punch/",
      category: "Costumes / Store",
      keywords: "punch costume cosmetic store",
    },
    {
      title: "Pyjama Banana Costume",
      url: "{{root}}costumes/store/pyjama-banana/",
      category: "Costumes / Store",
      keywords: "pyjama banana costume cosmetic store",
    },
    {
      title: "Ravage Costume",
      url: "{{root}}costumes/store/ravage/",
      category: "Costumes / Store",
      keywords: "ravage costume cosmetic store",
    },
    {
      title: "Raven Costume",
      url: "{{root}}costumes/store/raven/",
      category: "Costumes / Store",
      keywords: "raven costume cosmetic store",
    },
    {
      title: "Recon Agent Costume",
      url: "{{root}}costumes/store/recon-agent/",
      category: "Costumes / Store",
      keywords: "recon agent costume cosmetic store",
    },
    {
      title: "Red Panda Costume",
      url: "{{root}}costumes/store/red-panda/",
      category: "Costumes / Store",
      keywords: "red panda costume cosmetic store",
    },
    {
      title: "Reindeer Costume",
      url: "{{root}}costumes/store/reindeer/",
      category: "Costumes / Store",
      keywords: "reindeer costume cosmetic store",
    },
    {
      title: "Royal Corgi Costume",
      url: "{{root}}costumes/store/royal-corgi/",
      category: "Costumes / Store",
      keywords: "royal corgi costume cosmetic store",
    },
    {
      title: "Royal King and Queen Costume",
      url: "{{root}}costumes/store/royal-king-and-queen/",
      category: "Costumes / Store",
      keywords: "royal king and queen costume cosmetic store",
    },
    {
      title: "Royal Pegasus Costume",
      url: "{{root}}costumes/store/royal-pegasus/",
      category: "Costumes / Store",
      keywords: "royal pegasus costume cosmetic store",
    },
    {
      title: "Royal Unicorn Costume",
      url: "{{root}}costumes/store/royal-unicorn/",
      category: "Costumes / Store",
      keywords: "royal unicorn costume cosmetic store",
    },
    {
      title: "Rufus Costume",
      url: "{{root}}costumes/store/rufus/",
      category: "Costumes / Store",
      keywords: "rufus costume cosmetic store",
    },
    {
      title: "Rusty Costume",
      url: "{{root}}costumes/store/rusty/",
      category: "Costumes / Store",
      keywords: "rusty costume cosmetic store",
    },
    {
      title: "School Fox Costume",
      url: "{{root}}costumes/store/school-fox/",
      category: "Costumes / Store",
      keywords: "school fox costume cosmetic store",
    },
    {
      title: "Sculk Wolf Costume",
      url: "{{root}}costumes/store/sculk-wolf/",
      category: "Costumes / Store",
      keywords: "sculk wolf costume cosmetic store",
    },
    {
      title: "Sculk Wraith Costume",
      url: "{{root}}costumes/store/sculk-wraith/",
      category: "Costumes / Store",
      keywords: "sculk wraith costume cosmetic store",
    },
    {
      title: "Sculkolotl Costume",
      url: "{{root}}costumes/store/sculkolotl/",
      category: "Costumes / Store",
      keywords: "sculkolotl costume cosmetic store",
    },
    {
      title: "Sea Doge Costume",
      url: "{{root}}costumes/store/sea-doge/",
      category: "Costumes / Store",
      keywords: "sea doge costume cosmetic store",
    },
    {
      title: "Sergei Costume",
      url: "{{root}}costumes/store/sergei/",
      category: "Costumes / Store",
      keywords: "sergei costume cosmetic store",
    },
    {
      title: "Shroomy Costume",
      url: "{{root}}costumes/store/shroomy/",
      category: "Costumes / Store",
      keywords: "shroomy costume cosmetic store",
    },
    {
      title: "Sir Creeper Costume",
      url: "{{root}}costumes/store/sir-creeper/",
      category: "Costumes / Store",
      keywords: "sir creeper costume cosmetic store",
    },
    {
      title: "Skeleclaus Costume",
      url: "{{root}}costumes/store/skeleclaus/",
      category: "Costumes / Store",
      keywords: "skeleclaus costume cosmetic store",
    },
    {
      title: "Skelelotl Costume",
      url: "{{root}}costumes/store/skelelotl/",
      category: "Costumes / Store",
      keywords: "skelelotl costume cosmetic store",
    },
    {
      title: "Skellington Costume",
      url: "{{root}}costumes/store/skellington/",
      category: "Costumes / Store",
      keywords: "skellington costume cosmetic store",
    },
    {
      title: "Slimey Costume",
      url: "{{root}}costumes/store/slimey/",
      category: "Costumes / Store",
      keywords: "slimey costume cosmetic store",
    },
    {
      title: "Slimey Ice Edition Costume",
      url: "{{root}}costumes/store/slimey-ice-edition/",
      category: "Costumes / Store",
      keywords: "slimey ice edition costume cosmetic store",
    },
    {
      title: "Slimo Costume",
      url: "{{root}}costumes/store/slimo/",
      category: "Costumes / Store",
      keywords: "slimo costume cosmetic store",
    },
    {
      title: "Snowy Costume",
      url: "{{root}}costumes/store/snowy/",
      category: "Costumes / Store",
      keywords: "snowy costume cosmetic store",
    },
    {
      title: "Snowy Dragon Costume",
      url: "{{root}}costumes/store/snowy-dragon/",
      category: "Costumes / Store",
      keywords: "snowy dragon costume cosmetic store",
    },
    {
      title: "Solar Costume",
      url: "{{root}}costumes/store/solar/",
      category: "Costumes / Store",
      keywords: "solar costume cosmetic store",
    },
    {
      title: "Space Corgi Costume",
      url: "{{root}}costumes/store/space-corgi/",
      category: "Costumes / Store",
      keywords: "space corgi costume cosmetic store",
    },
    {
      title: "Space Kitten Costume",
      url: "{{root}}costumes/store/space-kitten/",
      category: "Costumes / Store",
      keywords: "space kitten costume cosmetic store",
    },
    {
      title: "Space Ranger Costume",
      url: "{{root}}costumes/store/space-ranger/",
      category: "Costumes / Store",
      keywords: "space ranger costume cosmetic store",
    },
    {
      title: "Sparkles Costume",
      url: "{{root}}costumes/store/sparkles/",
      category: "Costumes / Store",
      keywords: "sparkles costume cosmetic store",
    },
    {
      title: "Spider Queen Costume",
      url: "{{root}}costumes/store/spider-queen/",
      category: "Costumes / Store",
      keywords: "spider queen costume cosmetic store",
    },
    {
      title: "Spikes Costume",
      url: "{{root}}costumes/store/spikes/",
      category: "Costumes / Store",
      keywords: "spikes costume cosmetic store",
    },
    {
      title: "Sprinkles Costume",
      url: "{{root}}costumes/store/sprinkles/",
      category: "Costumes / Store",
      keywords: "sprinkles costume cosmetic store",
    },
    {
      title: "Storm Queen Costume",
      url: "{{root}}costumes/store/storm-queen/",
      category: "Costumes / Store",
      keywords: "storm queen costume cosmetic store",
    },
    {
      title: "Strawbee Costume",
      url: "{{root}}costumes/store/strawbee/",
      category: "Costumes / Store",
      keywords: "strawbee costume cosmetic store",
    },
    {
      title: "Strongman Costume",
      url: "{{root}}costumes/store/strongman/",
      category: "Costumes / Store",
      keywords: "strongman costume cosmetic store",
    },
    {
      title: "Summer Banana Costume",
      url: "{{root}}costumes/store/summer-banana/",
      category: "Costumes / Store",
      keywords: "summer banana costume cosmetic store",
    },
    {
      title: "Summer Bee Costume",
      url: "{{root}}costumes/store/summer-bee/",
      category: "Costumes / Store",
      keywords: "summer bee costume cosmetic store",
    },
    {
      title: "Summer Doge Costume",
      url: "{{root}}costumes/store/summer-doge/",
      category: "Costumes / Store",
      keywords: "summer doge costume cosmetic store",
    },
    {
      title: "Summer Fox Costume",
      url: "{{root}}costumes/store/summer-fox/",
      category: "Costumes / Store",
      keywords: "summer fox costume cosmetic store",
    },
    {
      title: "Summer Leopard Costume",
      url: "{{root}}costumes/store/summer-leopard/",
      category: "Costumes / Store",
      keywords: "summer leopard costume cosmetic store",
    },
    {
      title: "Summer Melon Costume",
      url: "{{root}}costumes/store/summer-melon/",
      category: "Costumes / Store",
      keywords: "summer melon costume cosmetic store",
    },
    {
      title: "Summer Unicorn Costume",
      url: "{{root}}costumes/store/summer-unicorn/",
      category: "Costumes / Store",
      keywords: "summer unicorn costume cosmetic store",
    },
    {
      title: "Summerlotl Costume",
      url: "{{root}}costumes/store/summerlotl/",
      category: "Costumes / Store",
      keywords: "summerlotl costume cosmetic store",
    },
    {
      title: "Summoner Costume",
      url: "{{root}}costumes/store/summoner/",
      category: "Costumes / Store",
      keywords: "summoner costume cosmetic store",
    },
    {
      title: "Sunny Costume",
      url: "{{root}}costumes/store/sunny/",
      category: "Costumes / Store",
      keywords: "sunny costume cosmetic store",
    },
    {
      title: "Swampy Costume",
      url: "{{root}}costumes/store/swampy/",
      category: "Costumes / Store",
      keywords: "swampy costume cosmetic store",
    },
    {
      title: "Taco Time Costume",
      url: "{{root}}costumes/store/taco-time/",
      category: "Costumes / Store",
      keywords: "taco time costume cosmetic store",
    },
    {
      title: "Tanuki Costume",
      url: "{{root}}costumes/store/tanuki/",
      category: "Costumes / Store",
      keywords: "tanuki costume cosmetic store",
    },
    {
      title: "Teddy Bear Costume",
      url: "{{root}}costumes/store/teddy-bear/",
      category: "Costumes / Store",
      keywords: "teddy bear costume cosmetic store",
    },
    {
      title: "Television Costume",
      url: "{{root}}costumes/store/television/",
      category: "Costumes / Store",
      keywords: "television costume cosmetic store",
    },
    {
      title: "The Assassin Costume",
      url: "{{root}}costumes/store/the-assassin/",
      category: "Costumes / Store",
      keywords: "the assassin costume cosmetic store",
    },
    {
      title: "The Night Phantom Costume",
      url: "{{root}}costumes/store/the-night-phantom/",
      category: "Costumes / Store",
      keywords: "the night phantom costume cosmetic store",
    },
    {
      title: "The Oni Costume",
      url: "{{root}}costumes/store/the-oni/",
      category: "Costumes / Store",
      keywords: "the oni costume cosmetic store",
    },
    {
      title: "The Overseer Costume",
      url: "{{root}}costumes/store/the-overseer/",
      category: "Costumes / Store",
      keywords: "the overseer costume cosmetic store",
    },
    {
      title: "The Traveler Costume",
      url: "{{root}}costumes/store/the-traveler/",
      category: "Costumes / Store",
      keywords: "the traveler costume cosmetic store",
    },
    {
      title: "Toastie Costume",
      url: "{{root}}costumes/store/toastie/",
      category: "Costumes / Store",
      keywords: "toastie costume cosmetic store",
    },
    {
      title: "Toy Robot Costume",
      url: "{{root}}costumes/store/toy-robot/",
      category: "Costumes / Store",
      keywords: "toy robot costume cosmetic store",
    },
    {
      title: "Toy Soldier Costume",
      url: "{{root}}costumes/store/toy-soldier/",
      category: "Costumes / Store",
      keywords: "toy soldier costume cosmetic store",
    },
    {
      title: "Toybot Costume",
      url: "{{root}}costumes/store/toybot/",
      category: "Costumes / Store",
      keywords: "toybot costume cosmetic store",
    },
    {
      title: "Trader Llama Costume",
      url: "{{root}}costumes/store/trader-llama/",
      category: "Costumes / Store",
      keywords: "trader llama costume cosmetic store",
    },
    {
      title: "Uncle Banana Costume",
      url: "{{root}}costumes/store/uncle-banana/",
      category: "Costumes / Store",
      keywords: "uncle banana costume cosmetic store",
    },
    {
      title: "Unicorn Costume",
      url: "{{root}}costumes/store/unicorn/",
      category: "Costumes / Store",
      keywords: "unicorn costume cosmetic store",
    },
    {
      title: "Unicorn Gold Edition Costume",
      url: "{{root}}costumes/store/unicorn-gold-edition/",
      category: "Costumes / Store",
      keywords: "unicorn gold edition costume cosmetic store",
    },
    {
      title: "Unipug Costume",
      url: "{{root}}costumes/store/unipug/",
      category: "Costumes / Store",
      keywords: "unipug costume cosmetic store",
    },
    {
      title: "Vampiric Rabbit Costume",
      url: "{{root}}costumes/store/vampiric-rabbit/",
      category: "Costumes / Store",
      keywords: "vampiric rabbit costume cosmetic store",
    },
    {
      title: "Villager 007 Costume",
      url: "{{root}}costumes/store/villager-007/",
      category: "Costumes / Store",
      keywords: "villager 007 costume cosmetic store",
    },
    {
      title: "Virus Costume",
      url: "{{root}}costumes/store/virus/",
      category: "Costumes / Store",
      keywords: "virus costume cosmetic store",
    },
    {
      title: "Waddles Costume",
      url: "{{root}}costumes/store/waddles/",
      category: "Costumes / Store",
      keywords: "waddles costume cosmetic store",
    },
    {
      title: "Walrus Costume",
      url: "{{root}}costumes/store/walrus/",
      category: "Costumes / Store",
      keywords: "walrus costume cosmetic store",
    },
    {
      title: "Warrior Croc Costume",
      url: "{{root}}costumes/store/warrior-croc/",
      category: "Costumes / Store",
      keywords: "warrior croc costume cosmetic store",
    },
    {
      title: "Werewolf Costume",
      url: "{{root}}costumes/store/werewolf/",
      category: "Costumes / Store",
      keywords: "werewolf costume cosmetic store",
    },
    {
      title: "Winter Husky Costume",
      url: "{{root}}costumes/store/winter-husky/",
      category: "Costumes / Store",
      keywords: "winter husky costume cosmetic store",
    },
    {
      title: "Winter Witch Costume",
      url: "{{root}}costumes/store/winter-witch/",
      category: "Costumes / Store",
      keywords: "winter witch costume cosmetic store",
    },
    {
      title: "Wolf Knight Costume",
      url: "{{root}}costumes/store/wolf-knight/",
      category: "Costumes / Store",
      keywords: "wolf knight costume cosmetic store",
    },
    {
      title: "Wolf Pack Costume",
      url: "{{root}}costumes/store/wolf-pack/",
      category: "Costumes / Store",
      keywords: "wolf pack costume cosmetic store",
    },
    {
      title: "Wolfy Costume",
      url: "{{root}}costumes/store/wolfy/",
      category: "Costumes / Store",
      keywords: "wolfy costume cosmetic store",
    },
    {
      title: "Woody Costume",
      url: "{{root}}costumes/store/woody/",
      category: "Costumes / Store",
      keywords: "woody costume cosmetic store",
    },
    {
      title: "Wooly Costume",
      url: "{{root}}costumes/store/wooly/",
      category: "Costumes / Store",
      keywords: "wooly costume cosmetic store",
    },
    {
      title: "Wooly Cow Costume",
      url: "{{root}}costumes/store/wooly-cow/",
      category: "Costumes / Store",
      keywords: "wooly cow costume cosmetic store",
    },
    {
      title: "Yeti Costume",
      url: "{{root}}costumes/store/yeti/",
      category: "Costumes / Store",
      keywords: "yeti costume cosmetic store",
    },
    {
      title: "Zebra Costume",
      url: "{{root}}costumes/store/zebra/",
      category: "Costumes / Store",
      keywords: "zebra costume cosmetic store",
    },
    {
      title: "Zesty Costume",
      url: "{{root}}costumes/store/zesty/",
      category: "Costumes / Store",
      keywords: "zesty costume cosmetic store",
    },
    {
      title: "Zombear Costume",
      url: "{{root}}costumes/store/zombear/",
      category: "Costumes / Store",
      keywords: "zombear costume cosmetic store",
    },
    {
      title: "Zombee Costume",
      url: "{{root}}costumes/store/zombee/",
      category: "Costumes / Store",
      keywords: "zombee costume cosmetic store",
    },
    {
      title: "Zompig Costume",
      url: "{{root}}costumes/store/zompig/",
      category: "Costumes / Store",
      keywords: "zompig costume cosmetic store",
    },
    {
      title: "Alien Costume",
      url: "{{root}}costumes/store/alien/",
      category: "Costumes / Store",
      keywords: "alien costume cosmetic store old",
    },
    {
      title: "Mini Pirate Costume",
      url: "{{root}}costumes/misc/mini-pirate/",
      category: "Costumes / Misc",
      keywords: "mini pirate costume misc old",
    },
    {
      title: "Hoverboard Costume",
      url: "{{root}}costumes/misc/hoverboard/",
      category: "Costumes / Misc",
      keywords: "hoverboard costume unreleased old",
    },
    {
      title: "Unreleased Content",
      url: "#",
      category: "Costumes",
      keywords: "unreleased cancelled cut content",
    },
    {
      title: "Quests",
      url: "{{root}}quests/",
      category: "NPCs & Lore",
      keywords:
        "quest master quests qp quest points daily quest costumes tickets anomaly breach npc",
    },
    {
      title: "Anomaly Breach",
      url: "{{root}}tickets/anomaly-breach/",
      category: "Tickets",
      keywords: "anomaly breach ticket minecoins tokens hive server",
    },
    {
      title: "Events",
      url: "{{root}}events/",
      category: "Navigation",
      keywords:
        "events hive-o-ween winterfest lunar new year easter egg hunt golden cubee hunt sonic",
    },
  ];

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function highlight(text, query) {
    var idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return (
      escapeHtml(text.slice(0, idx)) +
      "<mark>" +
      escapeHtml(text.slice(idx, idx + query.length)) +
      "</mark>" +
      escapeHtml(text.slice(idx + query.length))
    );
  }

  function searchIndex(query) {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(function (item) {
      return (
        item.title.toLowerCase().indexOf(q) !== -1 ||
        item.keywords.toLowerCase().indexOf(q) !== -1
      );
    }).slice(0, 8);
  }

  function wireSearch(container, root) {
    var input = container.querySelector("#wikiSearchInput");
    var results = container.querySelector("#wikiSearchResults");
    if (!input || !results) return;

    var activeIndex = -1;
    var currentItems = [];

    function closeResults() {
      results.classList.remove("is-open");
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
    }

    function render(query) {
      var matches = searchIndex(query);
      currentItems = matches;
      activeIndex = -1;

      if (!query.trim()) {
        closeResults();
        return;
      }

      if (!matches.length) {
        results.innerHTML =
          '<div class="search-results__empty">No results for "' +
          escapeHtml(query) +
          '"</div>';
        results.classList.add("is-open");
        input.setAttribute("aria-expanded", "true");
        return;
      }

      var byCategory = {};
      matches.forEach(function (item) {
        (byCategory[item.category] = byCategory[item.category] || []).push(
          item,
        );
      });

      var html = "";
      Object.keys(byCategory).forEach(function (cat) {
        html +=
          '<div class="search-results__group-label">' +
          escapeHtml(cat) +
          "</div>";
        byCategory[cat].forEach(function (item) {
          var href = item.url.split("{{root}}").join(root);
          html +=
            '<a class="search-results__item" href="' +
            href +
            '" role="option">' +
            highlight(item.title, query) +
            "</a>";
        });
      });

      results.innerHTML = html;
      results.classList.add("is-open");
      input.setAttribute("aria-expanded", "true");
    }

    input.addEventListener("input", function () {
      render(input.value);
    });

    input.addEventListener("focus", function () {
      if (input.value.trim()) render(input.value);
    });

    input.addEventListener("keydown", function (e) {
      var items = results.querySelectorAll(".search-results__item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();
          window.location.href = items[activeIndex].getAttribute("href");
        }
        return;
      } else if (e.key === "Escape") {
        closeResults();
        input.blur();
        return;
      } else {
        return;
      }

      items.forEach(function (it, i) {
        it.classList.toggle("is-active", i === activeIndex);
      });
      items[activeIndex].scrollIntoView({ block: "nearest" });
    });

    document.addEventListener("click", function (e) {
      if (!results.contains(e.target) && e.target !== input) {
        closeResults();
      }
    });
  }

  function loadInclude(el) {
    var name = el.getAttribute("data-include");
    var colonIdx = name.indexOf(":");
    var url;
    if (colonIdx !== -1) {
      var namespace = name.slice(0, colonIdx);
      var partialName = name.slice(colonIdx + 1);
      url = root + "partials/" + namespace + "s/" + partialName + ".html";
    } else {
      url = root + "partials/" + name + ".html";
    }
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load partial: " + url);
        return res.text();
      })
      .then(function (html) {
        var wrapper = document.createElement("div");
        wrapper.innerHTML = applyRoot(html);
        el.replaceWith.apply(
          el,
          wrapper.childNodes.length
            ? Array.prototype.slice.call(wrapper.childNodes)
            : [wrapper],
        );
        if (name === "header") {
          markActive(document);
          wireDropdown(document);
          wireSearch(document, root);
        }
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var includes = Array.prototype.slice.call(
      document.querySelectorAll("[data-include]"),
    );
    includes.forEach(loadInclude);
  });
})();

/* Open any content image in a new tab when clicked */
document.addEventListener("click", function (e) {
  const img = e.target.closest("img");
  if (!img) return;

  // Skip icons/logos in chrome (topbar, footer) — only wiki content images
  if (img.closest(".topbar, .site-footer, .hexmark")) return;

  // Skip images that are already wrapped in a link — let the link's
  // own href handle the click instead of overriding it with the raw image
  if (img.closest("a")) return;

  window.open(img.currentSrc || img.src, "_blank", "noopener");
});

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("img").forEach(function (img) {
    if (img.closest(".topbar, .site-footer, .hexmark")) return;
    if (img.closest("a")) return;
    img.style.cursor = "zoom-in";
  });
});
