const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = "W:/netflix_style_avatars/home/ubuntu/netflix_style_avatars";
const PUB = "D:/TAINING/harbor/public/avatars";
const CATALOG = "D:/TAINING/harbor/src/lib/avatars/catalog.ts";
const DIM = 384;
const Q = 85;

const MAP = {
  aizen: ["Bleach", "Aizen"], ichigo: ["Bleach", "Ichigo"], rukia: ["Bleach", "Rukia"], kenpachi: ["Bleach", "Kenpachi"],
  denji: ["Chainsaw Man", "Denji"], makima: ["Chainsaw Man", "Makima"], power: ["Chainsaw Man", "Power"], pochita: ["Chainsaw Man", "Pochita"],
  okarun: ["Dandadan", "Okarun"], momo: ["Dandadan", "Momo Ayase"], turbogranny: ["Dandadan", "Turbo Granny"], turbogranny_cat: ["Dandadan", "Turbo Granny (Cat)"],
  l: ["Death Note", "L"], lightyagami: ["Death Note", "Light Yagami"], ryuk: ["Death Note", "Ryuk"],
  goku: ["Dragon Ball", "Goku"],
  edwardelric: ["Fullmetal Alchemist", "Edward Elric"],
  frieren: ["Frieren", "Frieren"], fern: ["Frieren", "Fern"], himmel: ["Frieren", "Himmel"],
  grendizer: ["Grendizer", "Grendizer"], mazinger: ["Mazinger Z", "Mazinger"],
  gon: ["Hunter x Hunter", "Gon"], killua: ["Hunter x Hunter", "Killua"], hisoka: ["Hunter x Hunter", "Hisoka"],
  gojo: ["Jujutsu Kaisen", "Gojo"], sukuna: ["Jujutsu Kaisen", "Sukuna"],
  rei: ["Evangelion", "Rei"], shinji: ["Evangelion", "Shinji"],
  naruto: ["Naruto", "Naruto"], luffy: ["One Piece", "Luffy"],
  saitama: ["One Punch Man", "Saitama"], genos: ["One Punch Man", "Genos"],
  spikespiegel: ["Cowboy Bebop", "Spike Spiegel"], sailormoon: ["Sailor Moon", "Sailor Moon"],
  anya: ["Spy x Family", "Anya"], loid: ["Spy x Family", "Loid"], yor: ["Spy x Family", "Yor"],
  eren: ["Attack on Titan", "Eren"], mikasa: ["Attack on Titan", "Mikasa"], levi: ["Attack on Titan", "Levi"],
  hiei: ["Yu Yu Hakusho", "Hiei"], kurama: ["Yu Yu Hakusho", "Kurama"], yusuke: ["Yu Yu Hakusho", "Yusuke"],
  casca: ["Berserk", "Casca"], guts: ["Berserk", "Guts"], griffith: ["Berserk", "Griffith"],
  chihiro: ["Spirited Away", "Chihiro"], noface: ["Spirited Away", "No-Face"],
  totoro: ["My Neighbor Totoro", "Totoro"], ponyo: ["Ponyo", "Ponyo"], coraline: ["Coraline", "Coraline"],
  vi: ["Arcane", "Vi"],

  agentj: ["Men in Black", "Agent J"], agentk_v2: ["Men in Black", "Agent K"],
  ahmanet: ["The Mummy", "Ahmanet"], antonchigurh: ["No Country for Old Men", "Anton Chigurh"],
  aldoraine: ["Inglourious Basterds", "Aldo Raine"],
  austin_powers: ["Austin Powers", "Austin Powers"], drevil: ["Austin Powers", "Dr. Evil"], minime: ["Austin Powers", "Mini-Me"],
  bateman: ["American Psycho", "Patrick Bateman"],
  batman: ["DC", "Batman"], joker: ["DC", "Joker"], wonder_woman: ["DC", "Wonder Woman"],
  romeo: ["Romeo + Juliet", "Romeo"],
  baymax_v2: ["Big Hero 6", "Baymax"], beetlejuice: ["Beetlejuice", "Beetlejuice"],
  billy_butcher: ["The Boys", "Billy Butcher"], homelander: ["The Boys", "Homelander"],
  bond_connery: ["James Bond", "Bond (Connery)"], bond_craig: ["James Bond", "Bond (Craig)"], bond_moore: ["James Bond", "Bond (Moore)"],
  brennan: ["Step Brothers", "Brennan"], dale: ["Step Brothers", "Dale"],
  cage_conair: ["Nicolas Cage", "Con Air"], cage_faceoff: ["Nicolas Cage", "Face/Off"], cage_nationaltreasure: ["Nicolas Cage", "National Treasure"],
  calvincandie: ["Django Unchained", "Calvin Candie"], django: ["Django Unchained", "Django"], schultz: ["Django Unchained", "Dr. Schultz"],
  carlton: ["The Fresh Prince of Bel-Air", "Carlton"], freshprince: ["The Fresh Prince of Bel-Air", "Will"],
  chapolin: ["El Chapulin Colorado", "Chapulin"],
  chavo: ["El Chavo del Ocho", "El Chavo"], quico: ["El Chavo del Ocho", "Quico"], girafales: ["El Chavo del Ocho", "Prof. Jirafales"],
  chrisshiherlis: ["Heat", "Chris Shiherlis"], shiherlis_heist: ["Heat", "Shiherlis (Heist)"], mccauley: ["Heat", "Neil McCauley"], mccauley_heist: ["Heat", "McCauley (Heist)"], trejo_heist: ["Heat", "Trejo"], vincenthanna: ["Heat", "Vincent Hanna"],
  christopher: ["The Sopranos", "Christopher"], tony_soprano: ["The Sopranos", "Tony Soprano"],
  chucknorris_sheriff: ["Walker, Texas Ranger", "Cordell Walker"],
  cruise_ethanhunt: ["Tom Cruise", "Ethan Hunt"], cruise_maverick: ["Tom Cruise", "Maverick"], cruise_lesgrossman: ["Tom Cruise", "Les Grossman"],
  daenerys: ["Game of Thrones", "Daenerys"], jon_snow: ["Game of Thrones", "Jon Snow"],
  dalek: ["Doctor Who", "Dalek"], doctor4: ["Doctor Who", "Fourth Doctor"], doctor10: ["Doctor Who", "Tenth Doctor"], doctor11: ["Doctor Who", "Eleventh Doctor"], doctor12: ["Doctor Who", "Twelfth Doctor"],
  dannyocean: ["Ocean's Eleven", "Danny Ocean"],
  dannyzuko: ["Grease", "Danny Zuko"], sandy: ["Grease", "Sandy"],
  don_corleone: ["The Godfather", "Don Corleone"],
  donnieazoff: ["The Wolf of Wall Street", "Donnie Azoff"], jordanbelfort: ["The Wolf of Wall Street", "Jordan Belfort"],
  dreadpirate: ["The Princess Bride", "Westley"], inigo: ["The Princess Bride", "Inigo Montoya"], andre: ["The Princess Bride", "Fezzik"],
  eleven: ["Stranger Things", "Eleven"], hopper: ["Stranger Things", "Hopper"],
  frenchtaunter: ["Monty Python", "French Taunter"], kingarthur: ["Monty Python", "King Arthur"],
  frodo_clean: ["The Lord of the Rings", "Frodo"], gandalf: ["The Lord of the Rings", "Gandalf"], gollum: ["The Lord of the Rings", "Gollum"], legolas_clean: ["The Lord of the Rings", "Legolas"], sauron: ["The Lord of the Rings", "Sauron"],
  frontman: ["Squid Game", "Front Man"], gihun: ["Squid Game", "Gi-hun"],
  geralt: ["The Witcher", "Geralt"],
  gorn: ["Star Trek", "Gorn"], kirk: ["Star Trek", "Captain Kirk"], spock: ["Star Trek", "Spock"],
  grogu_v2: ["Star Wars", "Grogu"], hansolo: ["Star Wars", "Han Solo"], leia: ["Star Wars", "Leia"], lukeskywalker: ["Star Wars", "Luke Skywalker"], mando_v3: ["Star Wars", "The Mandalorian"], yoda_v2: ["Star Wars", "Yoda"],
  gusfring: ["Breaking Bad", "Gus Fring"], jessepinkman: ["Breaking Bad", "Jesse Pinkman"], saul_goodman: ["Breaking Bad", "Saul Goodman"], lalosalamanca: ["Breaking Bad", "Lalo Salamanca"], heisenberg_final: ["Breaking Bad", "Heisenberg"], mike_ehrmantraut: ["Breaking Bad", "Mike Ehrmantraut"],
  haaland: ["Footballers", "Haaland"], mbappe: ["Footballers", "Mbappe"], messi: ["Footballers", "Messi"], neymar: ["Footballers", "Neymar"], ronaldo: ["Footballers", "Ronaldo"],
  hagrid: ["Harry Potter", "Hagrid"], harrypotter: ["Harry Potter", "Harry Potter"], hermione: ["Harry Potter", "Hermione"],
  hansel: ["Zoolander", "Hansel"], mugatu: ["Zoolander", "Mugatu"], zoolander: ["Zoolander", "Derek Zoolander"],
  inspectorclouseau: ["The Pink Panther", "Inspector Clouseau"], pinkpanther: ["The Pink Panther", "Pink Panther"],
  jackdawson: ["Titanic", "Jack Dawson"],
  jenko: ["21 Jump Street", "Jenko"], schmidt: ["21 Jump Street", "Schmidt"],
  jerry: ["Tom and Jerry", "Jerry"], tom: ["Tom and Jerry", "Tom"],
  johnwayne: ["John Wayne", "John Wayne"],
  johnwick_v2: ["John Wick", "John Wick"],
  judgedredd: ["Judge Dredd", "Judge Dredd"],
  jules_winnfield: ["Pulp Fiction", "Jules Winnfield"], mia_wallace: ["Pulp Fiction", "Mia Wallace"], vincent_vega: ["Pulp Fiction", "Vincent Vega"],
  kirklazarus_v2: ["Tropic Thunder", "Kirk Lazarus"],
  kurtrussell_thing: ["The Thing", "MacReady"],
  leon: ["Leon: The Professional", "Leon"], mathilda: ["Leon: The Professional", "Mathilda"],
  locdog: ["Don't Be a Menace", "Loc Dog"],
  magicmike: ["Magic Mike", "Magic Mike"],
  manwithnoname: ["The Dollars Trilogy", "Man with No Name"],
  marla_singer: ["Fight Club", "Marla Singer"], tyler_durden: ["Fight Club", "Tyler Durden"],
  mclovin: ["Superbad", "McLovin"],
  milesmorales_v2: ["Spider-Verse", "Miles Morales"],
  morpheus: ["The Matrix", "Morpheus"], neo: ["The Matrix", "Neo"], trinity_v2: ["The Matrix", "Trinity"],
  mrbean: ["Mr. Bean", "Mr. Bean"],
  mrblonde: ["Reservoir Dogs", "Mr. Blonde"], mrbrown: ["Reservoir Dogs", "Mr. Brown"], mrorange: ["Reservoir Dogs", "Mr. Orange"], mrpink: ["Reservoir Dogs", "Mr. Pink"], mrwhite: ["Reservoir Dogs", "Mr. White"],
  negan: ["The Walking Dead", "Negan"], rick_grimes: ["The Walking Dead", "Rick Grimes"],
  oren_ishii: ["Kill Bill", "O-Ren Ishii"], the_bride: ["Kill Bill", "The Bride"],
  pabloescobar: ["Narcos", "Pablo Escobar"],
  rambo: ["Rambo", "Rambo"], rickybobby: ["Talladega Nights", "Ricky Bobby"], robocop: ["RoboCop", "RoboCop"],
  ronburgundy: ["Anchorman", "Ron Burgundy"],
  terminator: ["The Terminator", "Terminator"],
  tommy_shelby: ["Peaky Blinders", "Tommy Shelby"],
  tonymontana_v2: ["Scarface", "Tony Montana"],
  tonystark_v2: ["Marvel", "Iron Man"], wolverine: ["Marvel", "Wolverine"],
  tyrone_biggums: ["Chappelle's Show", "Tyrone Biggums"],
  wednesday: ["Wednesday", "Wednesday"],
  whitechick_kevin_v3: ["White Chicks", "Kevin"], whitechick_marcus_v3: ["White Chicks", "Marcus"], terrycrews: ["White Chicks", "Latrell"],
  theodore_v2: ["Her", "Theodore"],
  seth_rogen: ["Seth Rogen", "Seth Rogen"],

  aang: ["Avatar: The Last Airbender", "Aang"], katara: ["Avatar: The Last Airbender", "Katara"],
  blossom: ["The Powerpuff Girls", "Blossom"], bubbles: ["The Powerpuff Girls", "Bubbles"], buttercup: ["The Powerpuff Girls", "Buttercup"],
  eric_cartman: ["South Park", "Cartman"], cartman_cop: ["South Park", "Cartman (Cop)"], kenny: ["South Park", "Kenny"], kyle: ["South Park", "Kyle"],
  rick_sanchez: ["Rick and Morty", "Rick Sanchez"], morty: ["Rick and Morty", "Morty"],
  numbuh1_v2: ["Kids Next Door", "Numbuh 1"], numbuh2: ["Kids Next Door", "Numbuh 2"], numbuh3: ["Kids Next Door", "Numbuh 3"], numbuh4: ["Kids Next Door", "Numbuh 4"], numbuh5: ["Kids Next Door", "Numbuh 5"],
  hellokitty: ["Sanrio", "Hello Kitty"], kuromi: ["Sanrio", "Kuromi"], pompompurin: ["Sanrio", "Pompompurin"],
  misa_amane: ["Death Note", "Misa Amane"],
  jinx_arcane: ["Arcane", "Jinx"],
  dexterkiller: ["Dexter", "Dexter Morgan"],
  dexter_lab: ["Dexter's Laboratory", "Dexter"],
  dannyphantom: ["Danny Phantom", "Danny Phantom"],
  johnnybravo: ["Johnny Bravo", "Johnny Bravo"],
  samuraijack: ["Samurai Jack", "Samurai Jack"],
  spear_primal: ["Primal", "Spear"],
  princess_mononoke_v2: ["Princess Mononoke", "San"],

  ad_roger: ["American Dad", "Roger"],
  alien_xenomorph: ["Alien", "Xenomorph"],
  predator: ["Predator", "Predator"],
  ben10: ["Ben 10", "Ben 10"],
  horror_freddy: ["A Nightmare on Elm Street", "Freddy Krueger"],
  sloth_goonies: ["The Goonies", "Sloth"],
  chiikawa: ["Chiikawa", "Chiikawa"], chiikawa_usagi: ["Chiikawa", "Usagi"], hachiware: ["Chiikawa", "Hachiware"],
  fg_brian: ["Family Guy", "Brian"], fg_peter: ["Family Guy", "Peter"], fg_stewie: ["Family Guy", "Stewie"],
  spongebob: ["SpongeBob SquarePants", "SpongeBob"], patrick: ["SpongeBob SquarePants", "Patrick"], squidward: ["SpongeBob SquarePants", "Squidward"], mr_krabs: ["SpongeBob SquarePants", "Mr. Krabs"], fishnet_patrick: ["SpongeBob SquarePants", "Patrick (Fishnets)"], handsome_squidward: ["SpongeBob SquarePants", "Handsome Squidward"], chocolate_guy: ["SpongeBob SquarePants", "Chocolate Guy"],
  kickass: ["Kick-Ass", "Kick-Ass"], hitgirl: ["Kick-Ass", "Hit-Girl"], bigdaddy: ["Kick-Ass", "Big Daddy"],
  jackass_bam: ["Jackass", "Bam Margera"], jackass_knoxville: ["Jackass", "Johnny Knoxville"], jackass_steveo: ["Jackass", "Steve-O"],
  sharkboy: ["Sharkboy and Lavagirl", "Sharkboy"], lavagirl: ["Sharkboy and Lavagirl", "Lavagirl"],
  lcdp_professor: ["Money Heist", "The Professor"], lcdp_mask: ["Money Heist", "Dali Mask"],
  saintseiya_seiya: ["Saint Seiya", "Seiya"], saintseiya_hyoga: ["Saint Seiya", "Hyoga"], saintseiya_ikki: ["Saint Seiya", "Ikki"], saintseiya_shiryu: ["Saint Seiya", "Shiryu"], saintseiya_shun: ["Saint Seiya", "Shun"],
  teletubby_dipsy: ["Teletubbies", "Dipsy"], teletubby_laalaa: ["Teletubbies", "Laa-Laa"], teletubby_po: ["Teletubbies", "Po"], teletubby_tinkywinky: ["Teletubbies", "Tinky Winky"],
  tmnt_leonardo: ["TMNT", "Leonardo"], tmnt_donatello: ["TMNT", "Donatello"], tmnt_michelangelo: ["TMNT", "Michelangelo"], tmnt_raphael: ["TMNT", "Raphael"],
  twilight_bella: ["Twilight", "Bella"], twilight_edward: ["Twilight", "Edward"],

  steven_universe: ["Steven Universe", "Steven"], garnet: ["Steven Universe", "Garnet"], amethyst: ["Steven Universe", "Amethyst"], pearl: ["Steven Universe", "Pearl"], connie: ["Steven Universe", "Connie"],
  ash_pikachu: ["Pokemon", "Ash & Pikachu"],
  dipper_pines_v2: ["Gravity Falls", "Dipper"], mabel_pines_v2: ["Gravity Falls", "Mabel"], grunkle_stan: ["Gravity Falls", "Grunkle Stan"], bill_cipher: ["Gravity Falls", "Bill Cipher"],
  finn_the_human: ["Adventure Time", "Finn"], jake_the_dog: ["Adventure Time", "Jake"], bmo: ["Adventure Time", "BMO"], marceline: ["Adventure Time", "Marceline"], princess_bubblegum: ["Adventure Time", "Princess Bubblegum"],
  chowder: ["Chowder", "Chowder"], mung_daal: ["Chowder", "Mung Daal"], shnitzel: ["Chowder", "Shnitzel"],
  gumball: ["The Amazing World of Gumball", "Gumball"], darwin: ["The Amazing World of Gumball", "Darwin"],
  mordecai: ["Regular Show", "Mordecai"], rigby: ["Regular Show", "Rigby"], muscle_man: ["Regular Show", "Muscle Man"],
  tyrion_lannister: ["Game of Thrones", "Tyrion Lannister"], littlefinger: ["Game of Thrones", "Littlefinger"],
  stan_marsh: ["South Park", "Stan"], towelie: ["South Park", "Towelie"],
  steve_harrington: ["Stranger Things", "Steve Harrington"],

  nana: ["Nana", "Nana Osaki"],
  kaneki: ["Tokyo Ghoul", "Kaneki"],
  madoka: ["Madoka Magica", "Madoka"],
  taiga: ["Toradora", "Taiga"],
  sawako: ["Kimi ni Todoke", "Sawako"],
  kaworu: ["Evangelion", "Kaworu"],
  soul_eater_maka: ["Soul Eater", "Maka"], soul_eater_soul: ["Soul Eater", "Soul"], soul_eater_death_the_kid: ["Soul Eater", "Death the Kid"],
  cheech: ["Cheech and Chong", "Cheech"], tommy_chong: ["Cheech and Chong", "Tommy Chong"],
  harold: ["Harold & Kumar", "Harold"], kumar: ["Harold & Kumar", "Kumar"],
  pickle_rick: ["Rick and Morty", "Pickle Rick"],
  courage: ["Courage the Cowardly Dog", "Courage"],
  indiana_jones: ["Indiana Jones", "Indiana Jones"],
  invader_zim: ["Invader Zim", "Zim"],
  iron_giant: ["The Iron Giant", "The Iron Giant"],
  johnny_test: ["Johnny Test", "Johnny Test"],
  popeye: ["Popeye", "Popeye"],
  the_mask: ["The Mask", "The Mask"],

  hinata_hyuga: ["Naruto", "Hinata"], itachi_akatsuki: ["Naruto", "Itachi"], kakashi_sharingan: ["Naruto", "Kakashi"], sasuke_rinnegan: ["Naruto", "Sasuke"],
  ed: ["Ed, Edd n Eddy", "Ed"], edd: ["Ed, Edd n Eddy", "Edd"], eddy: ["Ed, Edd n Eddy", "Eddy"], plank: ["Ed, Edd n Eddy", "Plank"],
  gomez_addams: ["The Addams Family", "Gomez"], morticia_addams: ["The Addams Family", "Morticia"], uncle_fester: ["The Addams Family", "Uncle Fester"],
  fernando_alonso: ["Formula 1", "Alonso"], lando_norris: ["Formula 1", "Norris"], lewis_hamilton: ["Formula 1", "Hamilton"], max_verstappen: ["Formula 1", "Verstappen"],
  magneto: ["Marvel", "Magneto"], professor_x: ["Marvel", "Professor X"],
  gir_dog: ["Invader Zim", "GIR"],
  professor_utonium: ["The Powerpuff Girls", "Professor Utonium"],
  the_rock: ["WWE", "The Rock"], johncena: ["WWE", "John Cena"],
  michael_jordan_full: ["Athletes", "Michael Jordan"], tom_brady: ["Athletes", "Tom Brady"],
  alex_delarge: ["A Clockwork Orange", "Alex DeLarge"],
  herman_munster: ["The Munsters", "Herman Munster"],
  twilight_zone_gremlin: ["The Twilight Zone", "Gremlin"],
  v_for_vendetta: ["V for Vendetta", "V"],

  op_ace: ["One Piece", "Ace"], op_mihawk: ["One Piece", "Mihawk"], op_shanks: ["One Piece", "Shanks"], op_whitebeard: ["One Piece", "Whitebeard"], op_zoro: ["One Piece", "Zoro"],
  cult_scott_pilgrim: ["Scott Pilgrim", "Scott Pilgrim"], cult_ramona_flowers: ["Scott Pilgrim", "Ramona Flowers"], cult_kim_pine: ["Scott Pilgrim", "Kim Pine"], cult_wallace_wells_v3: ["Scott Pilgrim", "Wallace Wells"],
  cult_willy_wonka: ["Willy Wonka", "Willy Wonka (2005)"], cult_willy_wonka_1971: ["Willy Wonka", "Willy Wonka (1971)"], cult_oompa_loompa: ["Willy Wonka", "Oompa Loompa (2005)"], cult_oompa_loompa_1971: ["Willy Wonka", "Oompa Loompa (1971)"],
  pr_red_ranger: ["Power Rangers", "Red Ranger"], pr_blue_ranger: ["Power Rangers", "Blue Ranger"], pr_black_ranger: ["Power Rangers", "Black Ranger"], pr_green_ranger_v2: ["Power Rangers", "Green Ranger"], pr_pink_ranger: ["Power Rangers", "Pink Ranger"], pr_yellow_ranger: ["Power Rangers", "Yellow Ranger"],
  sp_chef: ["South Park", "Chef"], sp_mysterion: ["South Park", "Mysterion"], sp_professor_chaos: ["South Park", "Professor Chaos"], sp_the_coon: ["South Park", "The Coon"], sp_gay_fish: ["South Park", "Kanye"], sp_jennifer_lopez: ["South Park", "Jennifer Lopez"], sp_alien: ["South Park", "Visitor"], sp_anime_cartman: ["South Park", "Anime Cartman"], sp_anime_kenny: ["South Park", "Anime Kenny"], sp_anime_kyle: ["South Park", "Anime Kyle"], sp_anime_stan_v2: ["South Park", "Anime Stan"],
  abed_nadir: ["Community", "Abed"], britta_perry: ["Community", "Britta"], jeff_winger: ["Community", "Jeff Winger"], senor_chang: ["Community", "Senor Chang"], donald_glover_troy: ["Community", "Troy"],
  dwight_schrute: ["The Office", "Dwight"], jim_halpert: ["The Office", "Jim"], michael_scott: ["The Office", "Michael Scott"], pam_beesly: ["The Office", "Pam"], kevin_malone: ["The Office", "Kevin"], stanley_hudson: ["The Office", "Stanley"], angela_martin: ["The Office", "Angela"],
  harvey_specter: ["Suits", "Harvey Specter"], louis_litt: ["Suits", "Louis Litt"], mike_ross: ["Suits", "Mike Ross"],
  alan_hangover: ["The Hangover", "Alan"], phil_hangover: ["The Hangover", "Phil"], stu_hangover: ["The Hangover", "Stu"],
  vegeta: ["Dragon Ball", "Vegeta"], piccolo: ["Dragon Ball", "Piccolo"], trunks: ["Dragon Ball", "Trunks"], android_18: ["Dragon Ball", "Android 18"], master_roshi: ["Dragon Ball", "Master Roshi"],
  huey_freeman: ["The Boondocks", "Huey"], riley_freeman: ["The Boondocks", "Riley"], grandpa_freeman: ["The Boondocks", "Granddad"], uncle_ruckus_v2: ["The Boondocks", "Uncle Ruckus"], thugnificent_v2: ["The Boondocks", "Thugnificent"], boondocks_tom_dubois: ["The Boondocks", "Tom DuBois"], boondocks_slickback_v2: ["The Boondocks", "A Pimp Named Slickback"], boondocks_stinkmeaner_v2: ["The Boondocks", "Stinkmeaner"],
  athf_frylock: ["Aqua Teen Hunger Force", "Frylock"], athf_master_shake: ["Aqua Teen Hunger Force", "Master Shake"], athf_meatwad: ["Aqua Teen Hunger Force", "Meatwad"],
  gru: ["Despicable Me", "Gru"], minion: ["Despicable Me", "Minion"], vector: ["Despicable Me", "Vector"], balthazar_bratt: ["Despicable Me", "Balthazar Bratt"],
  pain: ["Naruto", "Pain"], might_guy: ["Naruto", "Might Guy"], sakura_haruno: ["Naruto", "Sakura"],
  tpb_ricky: ["Trailer Park Boys", "Ricky"], tpb_julian_perfect: ["Trailer Park Boys", "Julian"], tpb_bubbles: ["Trailer Park Boys", "Bubbles"],
  jeremy_clarkson: ["Top Gear", "Jeremy Clarkson"], james_may: ["Top Gear", "James May"], richard_hammond: ["Top Gear", "Richard Hammond"], the_stig: ["Top Gear", "The Stig"],
  roger_the_decider: ["American Dad", "Roger (The Decider)"], roger_jeannie_gold: ["American Dad", "Roger (Jeannie Gold)"], roger_legman: ["American Dad", "Roger (Legman)"], roger_ricky_spanish: ["American Dad", "Roger (Ricky Spanish)"],
  howl_jenkins_v2: ["Howl's Moving Castle", "Howl"], calcifer_v2: ["Howl's Moving Castle", "Calcifer"], turnip_head: ["Howl's Moving Castle", "Turnip Head"], sophie_young: ["Howl's Moving Castle", "Sophie"],
  murtaugh_lethal_weapon: ["Lethal Weapon", "Murtaugh"], riggs_lethal_weapon: ["Lethal Weapon", "Riggs"],
  danny_butterman: ["Hot Fuzz", "Danny Butterman"], nicholas_angel: ["Hot Fuzz", "Nicholas Angel"],
  michael_scofield: ["Prison Break", "Michael Scofield"], lincoln_burrows: ["Prison Break", "Lincoln Burrows"],
  joe_bauers: ["Idiocracy", "Joe Bauers"], frito_pendejo: ["Idiocracy", "Frito"], president_camacho: ["Idiocracy", "President Camacho"],
  ted_striker: ["Airplane!", "Ted Striker"], otto_pilot: ["Airplane!", "Otto"],
  charon_wick: ["John Wick", "Charon"], winston_wick: ["John Wick", "Winston"],
  ghostface_classic: ["Scream", "Ghostface"], ghostface_wazup: ["Scary Movie", "Ghostface"],
  brendan_fraser_mummy: ["Brendan Fraser", "The Mummy"], brendan_fraser_whale: ["Brendan Fraser", "The Whale"],
  matt_murdock: ["Marvel", "Daredevil"], wilson_fisk: ["Marvel", "Kingpin"],
  agent_smith: ["The Matrix", "Agent Smith"],
  anime_alphonse_elric: ["Fullmetal Alchemist", "Alphonse Elric"],
  oshira_sama: ["Spirited Away", "Oshira-sama"],
  pale_man: ["Pan's Labyrinth", "Pale Man"],
  sw_grievous: ["Star Wars", "General Grievous"],
  hellboy: ["Hellboy", "Hellboy"],
  boris_the_blade: ["Snatch", "Boris the Blade"],
  jesus_quintana: ["The Big Lebowski", "Jesus Quintana"],
  bixby_snyder: ["RoboCop", "Bixby Snyder"],
  kungfu_landlady: ["Kung Fu Hustle", "The Landlady"],
  wiseau_tommy: ["The Room", "Tommy Wiseau"],
  harry_the_hunter: ["Beetlejuice", "Harry the Hunter"],
  twin_peaks_man: ["Twin Peaks", "The Man from Another Place"],

  anime_alan_smiling: ["Smiling Friends", "Alan"], anime_charlie_smiling: ["Smiling Friends", "Charlie"], anime_mrboss_smiling: ["Smiling Friends", "Mr. Boss"], anime_pim_v2: ["Smiling Friends", "Pim"], anime_glep_v2: ["Smiling Friends", "Glep"],
  anime_ami: ["Hi Hi Puffy AmiYumi", "Ami"], anime_yumi: ["Hi Hi Puffy AmiYumi", "Yumi"],
  anime_catdog: ["CatDog", "CatDog"],
  anime_cheetara: ["ThunderCats", "Cheetara"], anime_lion_o: ["ThunderCats", "Lion-O"], anime_panthro: ["ThunderCats", "Panthro"],
  anime_mark_grayson: ["Invincible", "Mark Grayson"], anime_omni_man: ["Invincible", "Omni-Man"], anime_conquest: ["Invincible", "Conquest"], anime_thragg_v3: ["Invincible", "Thragg"],
  anime_david_martinez: ["Cyberpunk: Edgerunners", "David Martinez"], anime_lucy: ["Cyberpunk: Edgerunners", "Lucy"],
  anime_ein: ["Cowboy Bebop", "Ein"],
  anime_garu: ["Pucca", "Garu"], anime_pucca: ["Pucca", "Pucca"],
  anime_ren_classic: ["The Ren & Stimpy Show", "Ren"], anime_stimpy_classic: ["The Ren & Stimpy Show", "Stimpy"], cult_ren_grossup: ["The Ren & Stimpy Show", "Ren (Gross-Up)"], cult_stimpy_grossup: ["The Ren & Stimpy Show", "Stimpy (Gross-Up)"],
  anime_vash: ["Trigun", "Vash"], anime_wolfwood: ["Trigun", "Wolfwood"],
  cult_aladeen: ["The Dictator", "Aladeen"],
  cult_borat_v3: ["Borat", "Borat"],
  cult_chris_teamamerica: ["Team America", "Chris"], cult_gary_johnston: ["Team America", "Gary Johnston"], cult_lisa_teamamerica: ["Team America", "Lisa"], cult_matt_damon: ["Team America", "Matt Damon"],
  cult_frank_rabbit: ["Donnie Darko", "Frank"],
  cult_kenny_powers: ["Eastbound & Down", "Kenny Powers"],
  cult_mars_attacks: ["Mars Attacks!", "Martian"],
  cult_napoleon_dynamite: ["Napoleon Dynamite", "Napoleon Dynamite"],
  cult_ron_swanson: ["Parks and Recreation", "Ron Swanson"],
  cult_the_dude: ["The Big Lebowski", "The Dude"],
  sp_phillip: ["South Park", "Phillip"], sp_terrence: ["South Park", "Terrance"],
  sports_hulk_hogan: ["WWE", "Hulk Hogan"], sports_macho_man: ["WWE", "Macho Man"],
  tt_beast_boy_v2: ["Teen Titans", "Beast Boy"], tt_cyborg_v4: ["Teen Titans", "Cyborg"], tt_raven_v5: ["Teen Titans", "Raven"], tt_robin: ["Teen Titans", "Robin"], tt_starfire: ["Teen Titans", "Starfire"],

  global_asterix: ["Asterix", "Asterix"], global_obelix: ["Asterix", "Obelix"],
  global_tintin: ["Tintin", "Tintin"], global_haddock: ["Tintin", "Captain Haddock"], global_snowy: ["Tintin", "Snowy"],
  global_monica: ["Turma da Monica", "Monica"], global_cebolinha: ["Turma da Monica", "Cebolinha"], global_cascao: ["Turma da Monica", "Cascao"], global_magali: ["Turma da Monica", "Magali"],
  global_masha: ["Masha and the Bear", "Masha"], global_bear_masha: ["Masha and the Bear", "Bear"],
  global_bluto: ["Popeye", "Bluto"], global_olive_oyl: ["Popeye", "Olive Oyl"],
  global_chhota_bheem: ["Chhota Bheem", "Chhota Bheem"],
  global_maya_bee: ["Maya the Bee", "Maya"],
  global_moomin: ["Moomin", "Moomin"],
  global_pororo: ["Pororo", "Pororo"],
  global_sun_wukong: ["Monkey King", "Sun Wukong"],
  global_tsubasa: ["Captain Tsubasa", "Tsubasa"],
  global_vicky_viking: ["Vicky the Viking", "Vicky"],

  cult_sheldon_cooper: ["The Big Bang Theory", "Sheldon"], cult_leonard_hofstadter: ["The Big Bang Theory", "Leonard"], cult_howard_wolowitz: ["The Big Bang Theory", "Howard"], cult_raj_koothrappali: ["The Big Bang Theory", "Raj"], cult_bernadette: ["The Big Bang Theory", "Bernadette"],
  cult_cameron_tucker: ["Modern Family", "Cameron"], cult_mitchell_pritchett: ["Modern Family", "Mitchell"], cult_gloria_pritchett: ["Modern Family", "Gloria"], cult_manny_delgado: ["Modern Family", "Manny"],

  anime_hank_hill: ["King of the Hill", "Hank Hill"], anime_peggy_hill: ["King of the Hill", "Peggy Hill"], anime_bobby_hill: ["King of the Hill", "Bobby Hill"], anime_dale_gribble: ["King of the Hill", "Dale Gribble"], anime_bill_dauterive: ["King of the Hill", "Bill Dauterive"], anime_boomhauer: ["King of the Hill", "Boomhauer"],
  anime_bob_belcher: ["Bob's Burgers", "Bob Belcher"], anime_linda_belcher: ["Bob's Burgers", "Linda Belcher"], anime_tina_belcher: ["Bob's Burgers", "Tina Belcher"], anime_gene_belcher: ["Bob's Burgers", "Gene Belcher"], anime_louise_belcher: ["Bob's Burgers", "Louise Belcher"],
  anime_bender: ["Futurama", "Bender"], anime_philip_fry: ["Futurama", "Fry"], anime_turanga_leela: ["Futurama", "Leela"], anime_professor_farnsworth: ["Futurama", "Professor Farnsworth"], anime_zoidberg: ["Futurama", "Dr. Zoidberg"],
  anime_yami_yugi: ["Yu-Gi-Oh!", "Yami Yugi"], anime_seto_kaiba: ["Yu-Gi-Oh!", "Seto Kaiba"], anime_joey_wheeler: ["Yu-Gi-Oh!", "Joey Wheeler"], anime_exodia: ["Yu-Gi-Oh!", "Exodia"], anime_solomon_muto: ["Yu-Gi-Oh!", "Solomon Muto"],
  anime_beavis: ["Beavis and Butt-Head", "Beavis"], anime_butthead: ["Beavis and Butt-Head", "Butt-Head"],
  anime_naota_nandaba_flcl: ["FLCL", "Naota"], anime_haruko_haruhara_flcl: ["FLCL", "Haruko"], anime_canti_flcl: ["FLCL", "Canti"],
  anime_haku_dragon: ["Spirited Away", "Haku"], anime_yubaba: ["Spirited Away", "Yubaba"],
  anime_aku_samurai: ["Samurai Jack", "Aku"],
  anime_jenny_robot: ["My Life as a Teenage Robot", "Jenny"],
  anime_lain_iwakura_serial_experiments_lain: ["Serial Experiments Lain", "Lain"],
  bondmanspyxfam: ["Spy x Family", "Bondman"],
  cult_chandler_bing: ["Friends", "Chandler"], cult_joey_tribbiani: ["Friends", "Joey"], cult_monica_geller: ["Friends", "Monica"], cult_phoebe_buffay: ["Friends", "Phoebe"], cult_rachel_green_v2: ["Friends", "Rachel"], cult_ross_geller: ["Friends", "Ross"],
  cult_farva_v2: ["Super Troopers", "Farva"], cult_thorny_v2: ["Super Troopers", "Thorny"], cult_mac_supertroopers_v2: ["Super Troopers", "Mac"],
  cult_lloyd_christmas: ["Dumb and Dumber", "Lloyd Christmas"], cult_harry_dunne: ["Dumb and Dumber", "Harry Dunne"],
  cult_bill_s_preston: ["Bill & Ted", "Bill S. Preston"], cult_ted_logan: ["Bill & Ted", "Ted Logan"],
  cult_john_smith: ["Mr. & Mrs. Smith", "John Smith"], cult_jane_smith: ["Mr. & Mrs. Smith", "Jane Smith"],
  cult_paul_alien: ["Paul", "Paul"], cult_ted_bear: ["Ted", "Ted"], cult_officer_doofy_v2: ["Scary Movie", "Officer Doofy"], cult_raoul_duke: ["Fear and Loathing in Las Vegas", "Raoul Duke"],
  live_action_dean_winchester_supernatural: ["Supernatural", "Dean Winchester"], live_action_sam_winchester_supernatural: ["Supernatural", "Sam Winchester"], live_action_castiel_supernatural: ["Supernatural", "Castiel"],
  live_action_fox_mulder_xfiles: ["The X-Files", "Fox Mulder"], live_action_dana_scully_xfiles: ["The X-Files", "Dana Scully"],
  live_action_joe_goldberg_you: ["You", "Joe Goldberg"], live_action_anna_barton_obsession: ["Obsession", "Anna Barton"],
  internet_giorgio_tsoukalos_aliens: ["Ancient Aliens", "Giorgio Tsoukalos"],
  cartoon_cuddles_happy_tree_friends: ["Happy Tree Friends", "Cuddles"], cartoon_giggles_happy_tree_friends: ["Happy Tree Friends", "Giggles"], cartoon_lumpy_happy_tree_friends: ["Happy Tree Friends", "Lumpy"],
  cult_ninja_die_antwoord: ["Die Antwoord", "Ninja"], cult_yolandi_visser_die_antwoord: ["Die Antwoord", "Yolandi Visser"],
  cult_chappie: ["Chappie", "Chappie"],
  cartoon_butters_stotch_south_park: ["South Park", "Butters"],
  muppets_kermit_the_frog: ["The Muppets", "Kermit"], muppets_miss_piggy: ["The Muppets", "Miss Piggy"], muppets_fozzie_bear: ["The Muppets", "Fozzie Bear"], muppets_gonzo: ["The Muppets", "Gonzo"],
  eboy_manga_eyes_bw_zoomed: ["Aesthetic", "Manga Boy"], egirl_manga_eyes_bw_zoomed_distinct: ["Aesthetic", "Manga Girl"],
  cartoon_timmy_turner_fairly_oddparents: ["The Fairly OddParents", "Timmy Turner"], cartoon_cosmo_fairly_oddparents: ["The Fairly OddParents", "Cosmo"], cartoon_wanda_fairly_oddparents: ["The Fairly OddParents", "Wanda"],
};

const SORT_OVERRIDE = { bondmanspyxfam: "", sp_terrence: "Terrance1", sp_phillip: "Terrance2" };

function prettify(base) {
  return base
    .replace(/_(v\d+|clean|final|heist|sheriff)$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeId(s) {
  return s.replace(/\s*\(\d+\)\s*$/, "").replace(/[()]/g, "").replace(/\s+/g, "_");
}

(async () => {
  fs.mkdirSync(PUB, { recursive: true });
  for (const f of fs.readdirSync(PUB)) if (f.endsWith(".webp")) fs.unlinkSync(path.join(PUB, f));
  const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith(".png")).sort();
  const groups = {};
  let total = 0;
  const unmapped = [];
  for (const f of files) {
    const base = safeId(f.replace(/^gpt2_/i, "").replace(/\.png$/i, ""));
    const buf = await sharp(path.join(SRC, f)).resize(DIM, DIM, { fit: "cover" }).webp({ quality: Q }).toBuffer();
    fs.writeFileSync(path.join(PUB, base + ".webp"), buf);
    total += buf.length;
    const entry = MAP[base];
    if (!entry) unmapped.push(base);
    const [group, name] = entry || ["More", prettify(base)];
    (groups[group] ||= []).push({ id: base, name });
  }
  const labels = Object.keys(groups).filter((g) => g !== "More");
  labels.sort((a, b) => groups[b].length - groups[a].length || a.localeCompare(b));
  if (groups["More"]) labels.push("More");
  for (const g of labels) groups[g].sort((a, b) => (SORT_OVERRIDE[a.id] ?? a.name).localeCompare(SORT_OVERRIDE[b.id] ?? b.name));

  const lines = [];
  lines.push(`export type AvatarItem = { id: string; name: string };`);
  lines.push(`export type AvatarGroup = { group: string; items: AvatarItem[] };`);
  lines.push(``);
  lines.push(`export const avatarUrl = (id: string): string => \`/avatars/\${id}.webp\`;`);
  lines.push(``);
  lines.push(`export const AVATAR_CATALOG: AvatarGroup[] = [`);
  for (const g of labels) {
    lines.push(`  {`);
    lines.push(`    group: ${JSON.stringify(g)},`);
    lines.push(`    items: [`);
    for (const it of groups[g]) lines.push(`      { id: ${JSON.stringify(it.id)}, name: ${JSON.stringify(it.name)} },`);
    lines.push(`    ],`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  lines.push(`export const AVATAR_COUNT = ${files.length};`);
  lines.push(``);
  fs.mkdirSync(path.dirname(CATALOG), { recursive: true });
  fs.writeFileSync(CATALOG, lines.join("\n"));

  console.log(`OPTIMIZED ${files.length} avatars -> ${(total / 1024 / 1024).toFixed(2)}MB total (${(total / files.length / 1024).toFixed(1)}KB avg) at ${DIM}px webp q${Q}`);
  console.log(`GROUPS: ${labels.length}`);
  console.log(`UNMAPPED (-> "More", needs review): ${unmapped.length ? unmapped.join(", ") : "none"}`);
})().catch((e) => { console.error(e); process.exit(1); });
