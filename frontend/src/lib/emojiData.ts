// [emoji, primaryName, ...aliases]
export const EMOJI_DATA: readonly [string, ...string[]][] = [
  // Faces - happy
  ['😀','grinning'],['😃','smiley'],['😄','smile'],['😁','grin'],['😆','laughing','satisfied'],
  ['😅','sweat_smile'],['🤣','rofl'],['😂','joy'],['🙂','slightly_smiling_face'],['🙃','upside_down_face'],
  ['😉','wink'],['😊','blush'],['😇','innocent'],['🥰','smiling_face_3_hearts','heart_face'],
  ['😍','heart_eyes'],['🤩','star_struck'],['😘','kissing_heart'],['😋','yum'],
  ['😛','stuck_out_tongue'],['😜','stuck_out_tongue_winking_eye'],['🤪','zany_face'],
  ['🤑','money_mouth_face'],['🤗','hugs','hugging'],['🤭','hand_over_mouth'],
  ['🤫','shushing_face','shush'],['🤔','thinking'],['🤐','zipper_mouth_face'],
  ['🤨','raised_eyebrow'],['😐','neutral_face'],['😑','expressionless'],['😶','no_mouth'],
  ['😏','smirk'],['😒','unamused'],['🙄','roll_eyes','eye_roll'],['😬','grimacing'],
  ['🤥','lying_face'],['😔','pensive'],['😪','sleepy'],['🤤','drooling_face'],['😴','sleeping'],
  // Faces - sick/other
  ['😷','mask'],['🤒','thermometer_face'],['🤕','head_bandage'],['🤢','nauseated'],
  ['🤧','sneezing'],['🥵','hot_face'],['🥶','cold_face'],['🥴','woozy_face'],
  ['😵','dizzy_face'],['🤯','exploding_head'],['🤠','cowboy'],['🥳','partying_face'],
  ['😎','sunglasses','cool'],['🤓','nerd_face','nerd'],['🧐','monocle_face'],
  ['😕','confused'],['😟','worried'],['🙁','slightly_frowning'],['😮','open_mouth'],
  ['😯','hushed'],['😲','astonished'],['😳','flushed'],['🥺','pleading_face'],
  ['😦','frowning'],['😧','anguished'],['😨','fearful'],['😰','cold_sweat'],
  ['😥','disappointed_relieved'],['😢','cry'],['😭','sob','crying'],['😱','scream'],
  ['😖','confounded'],['😣','persevere'],['😞','disappointed'],['😓','sweat'],
  ['😩','weary'],['😫','tired_face'],['🥱','yawning_face','yawn'],['😤','triumph'],
  ['😡','rage','pout'],['😠','angry'],['🤬','cursing_face'],['😈','smiling_imp','devil'],
  ['👿','imp'],['💀','skull','dead'],['💩','poop','shit'],['🤡','clown_face'],
  ['👻','ghost'],['👽','alien'],['🤖','robot'],
  // Hands/gestures
  ['👋','wave'],['🤚','raised_back_of_hand'],['✋','hand','raised_hand'],
  ['🖖','vulcan_salute','spock'],['👌','ok_hand','ok'],['✌️','v','victory','peace'],
  ['🤞','crossed_fingers','fingers_crossed'],['🤘','metal','sign_of_horns'],
  ['🤙','call_me_hand'],['👈','point_left'],['👉','point_right'],['👆','point_up'],
  ['👇','point_down'],['☝️','index_pointing_up'],['👍','thumbsup','+1','thumbs_up'],
  ['👎','thumbsdown','-1','thumbs_down'],['✊','fist_raised'],['👊','oncoming_fist'],
  ['👏','clap','clapping'],['🙌','raised_hands'],['🙏','pray','folded_hands','thanks'],
  ['💪','muscle','flex','strong'],['🖕','middle_finger'],
  // Hearts
  ['❤️','heart','red_heart'],['🧡','orange_heart'],['💛','yellow_heart'],
  ['💚','green_heart'],['💙','blue_heart'],['💜','purple_heart'],['🖤','black_heart'],
  ['🤍','white_heart'],['🤎','brown_heart'],['💔','broken_heart'],
  ['💕','two_hearts'],['💞','revolving_hearts'],['💓','heartbeat'],['💗','heartpulse'],
  ['💖','sparkling_heart'],['💘','cupid'],['💝','gift_heart'],
  // Symbols/misc
  ['🔥','fire'],['⭐','star'],['🌟','star2','glowing_star'],['✨','sparkles'],
  ['💫','dizzy'],['💥','boom','collision','explosion'],['🎉','tada','party_popper'],
  ['🎊','confetti_ball'],['🎈','balloon'],['🎁','gift','present'],['🏆','trophy'],
  ['🥇','first_place','gold_medal'],['🎯','dart','bullseye'],['🎮','video_game','controller'],
  ['🎲','game_die','dice'],['🎨','art','palette'],['🎤','microphone','mic'],
  ['🎧','headphones'],['🎵','musical_note','note'],['🎶','notes','music'],
  ['📱','iphone','mobile_phone'],['💻','laptop','computer'],['🖥️','desktop_computer'],
  ['⌨️','keyboard'],['📷','camera'],['📸','camera_flash'],['📺','tv','television'],
  ['☎️','telephone'],['📞','telephone_receiver','phone'],['📡','satellite'],
  ['🔋','battery'],['💡','bulb','idea'],['🔦','flashlight'],['🕯️','candle'],
  ['🔑','key'],['🔒','lock'],['🔓','unlock'],['🔨','hammer'],['⚙️','gear'],
  ['🔧','wrench'],['🔩','nut_and_bolt'],['🔗','link'],['📎','paperclip'],
  ['📌','pushpin'],['📍','round_pushpin'],['✂️','scissors'],
  ['📁','file_folder','folder'],['📂','open_file_folder'],['📋','clipboard'],
  ['📊','bar_chart'],['📈','chart_up','trending_up'],['📉','chart_down','trending_down'],
  ['📝','memo','pencil','note'],['✏️','pencil2'],['📖','open_book'],['📚','books'],
  ['📰','newspaper'],['📄','page_facing_up'],['🔖','bookmark'],
  ['💰','moneybag','money'],['💵','dollar'],['💶','euro'],['💷','pound'],
  ['💸','money_with_wings'],['💳','credit_card'],
  // Status symbols
  ['✅','white_check_mark','check','done'],['❌','x','cross','no'],
  ['❓','question'],['❗','exclamation','bang'],['⚠️','warning'],
  ['🚫','no_entry_sign','banned'],['⛔','no_entry'],['🔔','bell'],
  ['🔕','no_bell'],['📢','loudspeaker'],['📣','mega','megaphone'],
  ['🆕','new'],['🆗','ok_button'],['🆙','up_button'],['🆒','cool_button'],
  ['🆓','free'],['🔴','red_circle'],['🟠','orange_circle'],['🟡','yellow_circle'],
  ['🟢','green_circle'],['🔵','blue_circle'],['⚫','black_circle'],['⚪','white_circle'],
  ['🔁','repeat'],['🔂','repeat_one'],['🔀','shuffle'],
  ['⏩','fast_forward'],['⏪','rewind'],['▶️','play','arrow_forward'],
  ['⏸️','pause'],['⏹️','stop'],['⏺️','record'],
  // Nature
  ['🌸','cherry_blossom'],['🌺','hibiscus'],['🌻','sunflower'],['🌹','rose'],
  ['🌷','tulip'],['🌱','seedling'],['🌲','evergreen_tree'],['🌳','tree'],
  ['🌴','palm_tree'],['🌵','cactus'],['🌿','herb'],['☘️','shamrock'],
  ['🍀','four_leaf_clover','lucky'],['🍁','maple_leaf'],['🍂','fallen_leaf'],
  ['🍃','leaves'],['🌾','ear_of_rice'],
  // Animals
  ['🐶','dog'],['🐱','cat'],['🐭','mouse'],['🐹','hamster'],['🐰','rabbit'],
  ['🦊','fox'],['🐻','bear'],['🐼','panda'],['🐨','koala'],['🐯','tiger'],
  ['🦁','lion'],['🐮','cow'],['🐷','pig'],['🐸','frog'],['🐵','monkey'],
  ['🐔','chicken'],['🐧','penguin'],['🐦','bird'],['🦅','eagle'],['🦆','duck'],
  ['🦉','owl'],['🦇','bat'],['🐝','bee','honeybee'],['🦋','butterfly'],
  ['🐛','bug','caterpillar'],['🐌','snail'],['🐢','turtle'],['🐍','snake'],
  ['🐉','dragon'],['🐳','whale'],['🐬','dolphin'],['🐟','fish'],
  ['🦈','shark'],['🐙','octopus'],['🐕','dog2'],['🐈','cat2'],
  // Food
  ['🍕','pizza'],['🍔','hamburger','burger'],['🍟','fries'],['🌭','hotdog'],
  ['🍿','popcorn'],['🍩','doughnut','donut'],['🎂','birthday_cake'],
  ['🍰','cake','shortcake'],['🍫','chocolate_bar','chocolate'],['🍬','candy'],
  ['🍭','lollipop'],['🍦','icecream','soft_ice_cream'],['🍪','cookie'],
  ['🍎','apple'],['🍊','tangerine','orange'],['🍋','lemon'],['🍇','grapes'],
  ['🍓','strawberry'],['🍒','cherries'],['🍑','peach'],['🥭','mango'],
  ['🍍','pineapple'],['🥑','avocado'],['🥦','broccoli'],['🌽','corn'],
  ['🥕','carrot'],['🥔','potato'],['🍞','bread'],['🍳','fried_egg','egg'],
  ['🥞','pancakes'],['🧇','waffle'],['🥓','bacon'],['🌮','taco'],['🌯','burrito'],
  ['🍜','ramen'],['🍝','spaghetti','pasta'],['🍛','curry'],['🍣','sushi'],
  ['🍱','bento'],['🧁','cupcake'],['🥧','pie'],
  ['☕','coffee'],['🍵','tea'],['🥛','milk'],['🍺','beer'],['🍻','beers'],
  ['🥂','champagne','clinking_glasses'],['🍷','wine'],['🍸','cocktail'],
  ['🍹','tropical_drink'],['🥃','whisky'],['🍾','bottle_popping_cork'],
  // Travel/places
  ['🚗','car'],['🚕','taxi'],['🚌','bus'],['🏎️','racing_car'],['🚑','ambulance'],
  ['🚒','fire_engine'],['🚚','truck'],['🚲','bike','bicycle'],['🛵','scooter'],
  ['🚁','helicopter'],['✈️','airplane','plane'],['🚀','rocket'],
  ['🛸','flying_saucer','ufo'],['⛵','sailboat'],['🚢','ship'],
  ['🏠','house','home'],['🏢','office'],['🏥','hospital'],['🏦','bank'],
  ['🏨','hotel'],['🏫','school'],['🏭','factory'],
  ['☀️','sunny','sun'],['⛅','partly_sunny'],['☁️','cloud'],
  ['🌧️','cloud_with_rain','rain'],['⛈️','thunder'],['❄️','snowflake','snow'],
  ['🌊','ocean','wave'],['💧','droplet','water'],['💦','sweat_drops'],
  ['⚡','zap','lightning'],['🌙','crescent_moon','moon'],['🌈','rainbow'],
  ['🌍','earth_africa'],['🌎','earth_americas'],['🌏','earth_asia'],
  ['🗺️','world_map','map'],['🏔️','mountain_snow'],['⛰️','mountain'],
  ['🏝️','island'],['🏕️','camping'],
]

export function searchEmojis(query: string, limit = 8): { emoji: string; name: string }[] {
  const q = query.toLowerCase()
  const results: { emoji: string; name: string }[] = []
  for (const [emoji, ...names] of EMOJI_DATA) {
    const match = (names as string[]).find(n => n.startsWith(q))
    if (match) {
      results.push({ emoji, name: names[0] as string })
      if (results.length >= limit) break
    }
  }
  return results
}
