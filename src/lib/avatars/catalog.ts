export type AvatarItem = { id: string; name: string };
export type AvatarGroup = { group: string; items: AvatarItem[] };

export const avatarUrl = (id: string): string => `/avatars/${id}.webp`;

export const AVATAR_CATALOG: AvatarGroup[] = [
  {
    group: "Star Wars",
    items: [
      { id: "grogu_v2", name: "Grogu" },
      { id: "hansolo", name: "Han Solo" },
      { id: "leia", name: "Leia" },
      { id: "lukeskywalker", name: "Luke Skywalker" },
      { id: "mando_v3", name: "The Mandalorian" },
      { id: "yoda_v2", name: "Yoda" },
    ],
  },
  {
    group: "Breaking Bad",
    items: [
      { id: "gusfring", name: "Gus Fring" },
      { id: "heisenberg_final", name: "Heisenberg" },
      { id: "jessepinkman", name: "Jesse Pinkman" },
      { id: "lalosalamanca", name: "Lalo Salamanca" },
      { id: "saul_goodman", name: "Saul Goodman" },
    ],
  },
  {
    group: "Doctor Who",
    items: [
      { id: "dalek", name: "Dalek" },
      { id: "doctor11", name: "Eleventh Doctor" },
      { id: "doctor4", name: "Fourth Doctor" },
      { id: "doctor10", name: "Tenth Doctor" },
      { id: "doctor12", name: "Twelfth Doctor" },
    ],
  },
  {
    group: "Footballers",
    items: [
      { id: "haaland", name: "Haaland" },
      { id: "mbappe", name: "Mbappe" },
      { id: "messi", name: "Messi" },
      { id: "neymar", name: "Neymar" },
      { id: "ronaldo", name: "Ronaldo" },
    ],
  },
  {
    group: "Heat",
    items: [
      { id: "mccauley_heist", name: "McCauley (Heist)" },
      { id: "mccauley", name: "Neil McCauley" },
      { id: "shiherlis_heist", name: "Shiherlis (Heist)" },
      { id: "trejo_heist", name: "Trejo" },
      { id: "vincenthanna", name: "Vincent Hanna" },
    ],
  },
  {
    group: "Kids Next Door",
    items: [
      { id: "numbuh1_v2", name: "Numbuh 1" },
      { id: "numbuh2", name: "Numbuh 2" },
      { id: "numbuh3", name: "Numbuh 3" },
      { id: "numbuh4", name: "Numbuh 4" },
      { id: "numbuh5", name: "Numbuh 5" },
    ],
  },
  {
    group: "Reservoir Dogs",
    items: [
      { id: "mrblonde", name: "Mr. Blonde" },
      { id: "mrbrown", name: "Mr. Brown" },
      { id: "mrorange", name: "Mr. Orange" },
      { id: "mrpink", name: "Mr. Pink" },
      { id: "mrwhite", name: "Mr. White" },
    ],
  },
  {
    group: "The Lord of the Rings",
    items: [
      { id: "frodo_clean", name: "Frodo" },
      { id: "gandalf", name: "Gandalf" },
      { id: "gollum", name: "Gollum" },
      { id: "legolas_clean", name: "Legolas" },
      { id: "sauron", name: "Sauron" },
    ],
  },
  {
    group: "Bleach",
    items: [
      { id: "aizen", name: "Aizen" },
      { id: "ichigo", name: "Ichigo" },
      { id: "kenpachi", name: "Kenpachi" },
      { id: "rukia", name: "Rukia" },
    ],
  },
  {
    group: "Chainsaw Man",
    items: [
      { id: "denji", name: "Denji" },
      { id: "makima", name: "Makima" },
      { id: "pochita", name: "Pochita" },
      { id: "power", name: "Power" },
    ],
  },
  {
    group: "Dandadan",
    items: [
      { id: "momo", name: "Momo Ayase" },
      { id: "okarun", name: "Okarun" },
      { id: "turbogranny", name: "Turbo Granny" },
      { id: "turbogranny_cat", name: "Turbo Granny (Cat)" },
    ],
  },
  {
    group: "Death Note",
    items: [
      { id: "l", name: "L" },
      { id: "lightyagami", name: "Light Yagami" },
      { id: "misa_amane", name: "Misa Amane" },
      { id: "ryuk", name: "Ryuk" },
    ],
  },
  {
    group: "South Park",
    items: [
      { id: "eric_cartman", name: "Cartman" },
      { id: "cartman_cop", name: "Cartman (Cop)" },
      { id: "kenny", name: "Kenny" },
      { id: "kyle", name: "Kyle" },
    ],
  },
  {
    group: "Attack on Titan",
    items: [
      { id: "eren", name: "Eren" },
      { id: "levi", name: "Levi" },
      { id: "mikasa", name: "Mikasa" },
    ],
  },
  {
    group: "Austin Powers",
    items: [
      { id: "austin_powers", name: "Austin Powers" },
      { id: "drevil", name: "Dr. Evil" },
      { id: "minime", name: "Mini-Me" },
    ],
  },
  {
    group: "Berserk",
    items: [
      { id: "casca", name: "Casca" },
      { id: "griffith", name: "Griffith" },
      { id: "guts", name: "Guts" },
    ],
  },
  {
    group: "DC",
    items: [
      { id: "batman", name: "Batman" },
      { id: "joker", name: "Joker" },
      { id: "wonder_woman", name: "Wonder Woman" },
    ],
  },
  {
    group: "Django Unchained",
    items: [
      { id: "calvincandie", name: "Calvin Candie" },
      { id: "django", name: "Django" },
      { id: "schultz", name: "Dr. Schultz" },
    ],
  },
  {
    group: "El Chavo del Ocho",
    items: [
      { id: "chavo", name: "El Chavo" },
      { id: "girafales", name: "Prof. Jirafales" },
      { id: "quico", name: "Quico" },
    ],
  },
  {
    group: "Frieren",
    items: [
      { id: "fern", name: "Fern" },
      { id: "frieren", name: "Frieren" },
      { id: "himmel", name: "Himmel" },
    ],
  },
  {
    group: "Harry Potter",
    items: [
      { id: "hagrid", name: "Hagrid" },
      { id: "harrypotter", name: "Harry Potter" },
      { id: "hermione", name: "Hermione" },
    ],
  },
  {
    group: "Hunter x Hunter",
    items: [
      { id: "gon", name: "Gon" },
      { id: "hisoka", name: "Hisoka" },
      { id: "killua", name: "Killua" },
    ],
  },
  {
    group: "James Bond",
    items: [
      { id: "bond_connery", name: "Bond (Connery)" },
      { id: "bond_craig", name: "Bond (Craig)" },
      { id: "bond_moore", name: "Bond (Moore)" },
    ],
  },
  {
    group: "Nicolas Cage",
    items: [
      { id: "cage_conair", name: "Con Air" },
      { id: "cage_faceoff", name: "Face/Off" },
      { id: "cage_nationaltreasure", name: "National Treasure" },
    ],
  },
  {
    group: "Pulp Fiction",
    items: [
      { id: "jules_winnfield", name: "Jules Winnfield" },
      { id: "mia_wallace", name: "Mia Wallace" },
      { id: "vincent_vega", name: "Vincent Vega" },
    ],
  },
  {
    group: "Sanrio",
    items: [
      { id: "hellokitty", name: "Hello Kitty" },
      { id: "kuromi", name: "Kuromi" },
      { id: "pompompurin", name: "Pompompurin" },
    ],
  },
  {
    group: "Spy x Family",
    items: [
      { id: "anya", name: "Anya" },
      { id: "loid", name: "Loid" },
      { id: "yor", name: "Yor" },
    ],
  },
  {
    group: "Star Trek",
    items: [
      { id: "kirk", name: "Captain Kirk" },
      { id: "gorn", name: "Gorn" },
      { id: "spock", name: "Spock" },
    ],
  },
  {
    group: "The Matrix",
    items: [
      { id: "morpheus", name: "Morpheus" },
      { id: "neo", name: "Neo" },
      { id: "trinity_v2", name: "Trinity" },
    ],
  },
  {
    group: "The Powerpuff Girls",
    items: [
      { id: "blossom", name: "Blossom" },
      { id: "bubbles", name: "Bubbles" },
      { id: "buttercup", name: "Buttercup" },
    ],
  },
  {
    group: "The Princess Bride",
    items: [
      { id: "andre", name: "Fezzik" },
      { id: "inigo", name: "Inigo Montoya" },
      { id: "dreadpirate", name: "Westley" },
    ],
  },
  {
    group: "Tom Cruise",
    items: [
      { id: "cruise_ethanhunt", name: "Ethan Hunt" },
      { id: "cruise_lesgrossman", name: "Les Grossman" },
      { id: "cruise_maverick", name: "Maverick" },
    ],
  },
  {
    group: "White Chicks",
    items: [
      { id: "whitechick_kevin_v3", name: "Kevin" },
      { id: "terrycrews", name: "Latrell" },
      { id: "whitechick_marcus_v3", name: "Marcus" },
    ],
  },
  {
    group: "Yu Yu Hakusho",
    items: [
      { id: "hiei", name: "Hiei" },
      { id: "kurama", name: "Kurama" },
      { id: "yusuke", name: "Yusuke" },
    ],
  },
  {
    group: "Zoolander",
    items: [
      { id: "zoolander", name: "Derek Zoolander" },
      { id: "hansel", name: "Hansel" },
      { id: "mugatu", name: "Mugatu" },
    ],
  },
  {
    group: "21 Jump Street",
    items: [
      { id: "jenko", name: "Jenko" },
      { id: "schmidt", name: "Schmidt" },
    ],
  },
  {
    group: "Arcane",
    items: [
      { id: "jinx_arcane", name: "Jinx" },
      { id: "vi", name: "Vi" },
    ],
  },
  {
    group: "Avatar: The Last Airbender",
    items: [
      { id: "aang", name: "Aang" },
      { id: "katara", name: "Katara" },
    ],
  },
  {
    group: "Evangelion",
    items: [
      { id: "rei", name: "Rei" },
      { id: "shinji", name: "Shinji" },
    ],
  },
  {
    group: "Fight Club",
    items: [
      { id: "marla_singer", name: "Marla Singer" },
      { id: "tyler_durden", name: "Tyler Durden" },
    ],
  },
  {
    group: "Game of Thrones",
    items: [
      { id: "daenerys", name: "Daenerys" },
      { id: "jon_snow", name: "Jon Snow" },
    ],
  },
  {
    group: "Grease",
    items: [
      { id: "dannyzuko", name: "Danny Zuko" },
      { id: "sandy", name: "Sandy" },
    ],
  },
  {
    group: "Jujutsu Kaisen",
    items: [
      { id: "gojo", name: "Gojo" },
      { id: "sukuna", name: "Sukuna" },
    ],
  },
  {
    group: "Kill Bill",
    items: [
      { id: "oren_ishii", name: "O-Ren Ishii" },
      { id: "the_bride", name: "The Bride" },
    ],
  },
  {
    group: "Leon: The Professional",
    items: [
      { id: "leon", name: "Leon" },
      { id: "mathilda", name: "Mathilda" },
    ],
  },
  {
    group: "Marvel",
    items: [
      { id: "tonystark_v2", name: "Iron Man" },
      { id: "wolverine", name: "Wolverine" },
    ],
  },
  {
    group: "Men in Black",
    items: [
      { id: "agentj", name: "Agent J" },
      { id: "agentk_v2", name: "Agent K" },
    ],
  },
  {
    group: "Monty Python",
    items: [
      { id: "frenchtaunter", name: "French Taunter" },
      { id: "kingarthur", name: "King Arthur" },
    ],
  },
  {
    group: "Naruto",
    items: [
      { id: "kakashi", name: "Kakashi" },
      { id: "naruto", name: "Naruto" },
    ],
  },
  {
    group: "One Punch Man",
    items: [
      { id: "genos", name: "Genos" },
      { id: "saitama", name: "Saitama" },
    ],
  },
  {
    group: "Rick and Morty",
    items: [
      { id: "morty", name: "Morty" },
      { id: "rick_sanchez", name: "Rick Sanchez" },
    ],
  },
  {
    group: "Spirited Away",
    items: [
      { id: "chihiro", name: "Chihiro" },
      { id: "noface", name: "No-Face" },
    ],
  },
  {
    group: "Squid Game",
    items: [
      { id: "frontman", name: "Front Man" },
      { id: "gihun", name: "Gi-hun" },
    ],
  },
  {
    group: "Step Brothers",
    items: [
      { id: "brennan", name: "Brennan" },
      { id: "dale", name: "Dale" },
    ],
  },
  {
    group: "Stranger Things",
    items: [
      { id: "eleven", name: "Eleven" },
      { id: "hopper", name: "Hopper" },
    ],
  },
  {
    group: "The Boys",
    items: [
      { id: "billy_butcher", name: "Billy Butcher" },
      { id: "homelander", name: "Homelander" },
    ],
  },
  {
    group: "The Fresh Prince of Bel-Air",
    items: [
      { id: "carlton", name: "Carlton" },
      { id: "freshprince", name: "Will" },
    ],
  },
  {
    group: "The Pink Panther",
    items: [
      { id: "inspectorclouseau", name: "Inspector Clouseau" },
      { id: "pinkpanther", name: "Pink Panther" },
    ],
  },
  {
    group: "The Sopranos",
    items: [
      { id: "christopher", name: "Christopher" },
      { id: "tony_soprano", name: "Tony Soprano" },
    ],
  },
  {
    group: "The Walking Dead",
    items: [
      { id: "negan", name: "Negan" },
      { id: "rick_grimes", name: "Rick Grimes" },
    ],
  },
  {
    group: "The Wolf of Wall Street",
    items: [
      { id: "donnieazoff", name: "Donnie Azoff" },
      { id: "jordanbelfort", name: "Jordan Belfort" },
    ],
  },
  {
    group: "Tom and Jerry",
    items: [
      { id: "jerry", name: "Jerry" },
      { id: "tom", name: "Tom" },
    ],
  },
  {
    group: "American Psycho",
    items: [
      { id: "bateman", name: "Patrick Bateman" },
    ],
  },
  {
    group: "Anchorman",
    items: [
      { id: "ronburgundy", name: "Ron Burgundy" },
    ],
  },
  {
    group: "Beetlejuice",
    items: [
      { id: "beetlejuice", name: "Beetlejuice" },
    ],
  },
  {
    group: "Big Hero 6",
    items: [
      { id: "baymax_v2", name: "Baymax" },
    ],
  },
  {
    group: "Chappelle's Show",
    items: [
      { id: "tyrone_biggums", name: "Tyrone Biggums" },
    ],
  },
  {
    group: "Coraline",
    items: [
      { id: "coraline", name: "Coraline" },
    ],
  },
  {
    group: "Cowboy Bebop",
    items: [
      { id: "spikespiegel", name: "Spike Spiegel" },
    ],
  },
  {
    group: "Danny Phantom",
    items: [
      { id: "dannyphantom", name: "Danny Phantom" },
    ],
  },
  {
    group: "Dexter",
    items: [
      { id: "dexterkiller", name: "Dexter Morgan" },
    ],
  },
  {
    group: "Dexter's Laboratory",
    items: [
      { id: "dexter_lab", name: "Dexter" },
    ],
  },
  {
    group: "Don't Be a Menace",
    items: [
      { id: "locdog", name: "Loc Dog" },
    ],
  },
  {
    group: "Dragon Ball",
    items: [
      { id: "goku", name: "Goku" },
    ],
  },
  {
    group: "El Chapulin Colorado",
    items: [
      { id: "chapolin", name: "Chapulin" },
    ],
  },
  {
    group: "Fullmetal Alchemist",
    items: [
      { id: "edwardelric", name: "Edward Elric" },
    ],
  },
  {
    group: "Grendizer",
    items: [
      { id: "grendizer", name: "Grendizer" },
    ],
  },
  {
    group: "Her",
    items: [
      { id: "theodore_v2", name: "Theodore" },
    ],
  },
  {
    group: "Inglourious Basterds",
    items: [
      { id: "aldoraine", name: "Aldo Raine" },
    ],
  },
  {
    group: "John Wayne",
    items: [
      { id: "johnwayne", name: "John Wayne" },
    ],
  },
  {
    group: "John Wick",
    items: [
      { id: "johnwick_v2", name: "John Wick" },
    ],
  },
  {
    group: "Johnny Bravo",
    items: [
      { id: "johnnybravo", name: "Johnny Bravo" },
    ],
  },
  {
    group: "Judge Dredd",
    items: [
      { id: "judgedredd", name: "Judge Dredd" },
    ],
  },
  {
    group: "Magic Mike",
    items: [
      { id: "magicmike", name: "Magic Mike" },
    ],
  },
  {
    group: "Mazinger Z",
    items: [
      { id: "mazinger", name: "Mazinger" },
    ],
  },
  {
    group: "Mr. Bean",
    items: [
      { id: "mrbean", name: "Mr. Bean" },
    ],
  },
  {
    group: "My Neighbor Totoro",
    items: [
      { id: "totoro", name: "Totoro" },
    ],
  },
  {
    group: "Narcos",
    items: [
      { id: "pabloescobar", name: "Pablo Escobar" },
    ],
  },
  {
    group: "No Country for Old Men",
    items: [
      { id: "antonchigurh", name: "Anton Chigurh" },
    ],
  },
  {
    group: "Ocean's Eleven",
    items: [
      { id: "dannyocean", name: "Danny Ocean" },
    ],
  },
  {
    group: "One Piece",
    items: [
      { id: "luffy", name: "Luffy" },
    ],
  },
  {
    group: "Peaky Blinders",
    items: [
      { id: "tommy_shelby", name: "Tommy Shelby" },
    ],
  },
  {
    group: "Ponyo",
    items: [
      { id: "ponyo", name: "Ponyo" },
    ],
  },
  {
    group: "Primal",
    items: [
      { id: "spear_primal", name: "Spear" },
    ],
  },
  {
    group: "Princess Mononoke",
    items: [
      { id: "princess_mononoke_v2", name: "San" },
    ],
  },
  {
    group: "Rambo",
    items: [
      { id: "rambo", name: "Rambo" },
    ],
  },
  {
    group: "RoboCop",
    items: [
      { id: "robocop", name: "RoboCop" },
    ],
  },
  {
    group: "Romeo + Juliet",
    items: [
      { id: "romeo", name: "Romeo" },
    ],
  },
  {
    group: "Sailor Moon",
    items: [
      { id: "sailormoon", name: "Sailor Moon" },
    ],
  },
  {
    group: "Samurai Jack",
    items: [
      { id: "samuraijack", name: "Samurai Jack" },
    ],
  },
  {
    group: "Scarface",
    items: [
      { id: "tonymontana_v2", name: "Tony Montana" },
    ],
  },
  {
    group: "Seth Rogen",
    items: [
      { id: "seth_rogen", name: "Seth Rogen" },
    ],
  },
  {
    group: "Spider-Verse",
    items: [
      { id: "milesmorales_v2", name: "Miles Morales" },
    ],
  },
  {
    group: "Superbad",
    items: [
      { id: "mclovin", name: "McLovin" },
    ],
  },
  {
    group: "Talladega Nights",
    items: [
      { id: "rickybobby", name: "Ricky Bobby" },
    ],
  },
  {
    group: "The Dollars Trilogy",
    items: [
      { id: "manwithnoname", name: "Man with No Name" },
    ],
  },
  {
    group: "The Godfather",
    items: [
      { id: "don_corleone", name: "Don Corleone" },
    ],
  },
  {
    group: "The Mummy",
    items: [
      { id: "ahmanet", name: "Ahmanet" },
    ],
  },
  {
    group: "The Terminator",
    items: [
      { id: "terminator", name: "Terminator" },
    ],
  },
  {
    group: "The Thing",
    items: [
      { id: "kurtrussell_thing", name: "MacReady" },
    ],
  },
  {
    group: "The Witcher",
    items: [
      { id: "geralt", name: "Geralt" },
    ],
  },
  {
    group: "Titanic",
    items: [
      { id: "jackdawson", name: "Jack Dawson" },
    ],
  },
  {
    group: "Tropic Thunder",
    items: [
      { id: "kirklazarus_v2", name: "Kirk Lazarus" },
    ],
  },
  {
    group: "Walker, Texas Ranger",
    items: [
      { id: "chucknorris_sheriff", name: "Cordell Walker" },
    ],
  },
  {
    group: "Wednesday",
    items: [
      { id: "wednesday", name: "Wednesday" },
    ],
  },
];

export const AVATAR_COUNT = 234;
