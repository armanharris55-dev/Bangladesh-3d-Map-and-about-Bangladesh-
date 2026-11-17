# বাংলাদেশ ৩ডি মানচিত্র (চাকরির প্রস্তুতি)

BCS, ব্যাংক ও অন্যান্য চাকরির পরীক্ষার্থীদের জন্য ইন্টারঅ্যাকটিভ ৩ডি মানচিত্র।
৮টি বিভাগ আলাদা রঙে, ৬৪টি জেলার সীমানাসহ। বাংলায় বিস্তারিত তথ্য ও কুইজ আছে।

## চালানোর নিয়ম (Python থাকলেই হবে, কিছু install লাগবে না)

    python server.py          # Windows-এ run.bat ডাবল ক্লিক করলেও হবে
    # Linux/Mac:  ./run.sh

ব্রাউজারে খুলবে: http://localhost:8000
(`index.html` সরাসরি ডাবল ক্লিক করলে চলবে না, কারণ ES modules ও JSON লোড করতে server লাগে।)

## নতুন: লাইভ ম্যাপ (http://localhost:8000/live.html)
জুম করলে বিভাগ → জেলা → উপজেলা → গ্রাম/বাজার। ইন্টারনেট লাগবে (বেসম্যাপের জন্য)।
- MapLibre GL JS (থার্ড-পার্টি): আসল ভেক্টর ম্যাপ (OpenFreeMap/OpenStreetMap), ৩ডি ভবন, ৩ডি ভূমিরূপ (AWS terrain), পিচ/রোটেট
- স্যাটেলাইট ছবি (Esri) বাটনে এক ক্লিকে
- ৫৪৪ উপজেলা/থানার সীমানা ও বাংলা নাম, ডাকঘর ও পোস্টকোড
- যে এলাকায় জুম করবেন, সেখানকার গ্রাম/বাজার/মহল্লার নাম প্যানেলে আসে (OpenStreetMap থেকে)
- ক্লিক বা সার্চ করলে সেখানে উড়ে যায়, ডানে বিভাগ/জেলা/উপজেলার তথ্য
- ইন্টারনেট না থাকলে শুধু সীমানা দেখায় (বেসম্যাপ ছাড়া)
- সীমাবদ্ধতা: গ্রামের সীমানা (polygon) ফ্রি ডেটায় নেই; গ্রাম শুধু নাম হিসেবে OSM থেকে আসে। ইউনিয়ন সীমানাও নেই

## ফিচার
- ৩ডি মানচিত্র: hover করলে বিভাগ উঁচু হয়, ক্লিক করলে ক্যামেরা সেখানে যায়
- বিভাগ বেছে নেওয়ার পর জেলায় ক্লিক/hover করা যায়
- সাইড প্যানেলে: সদর, আয়তন, জনসংখ্যা, নদী, প্রকৃতি, কৃষি-শিল্প, ইতিহাস, পরীক্ষার পয়েন্ট
- ২ডি/৩ডি, জেলা সীমা on/off, অটো ঘোরানো, রিসেট
- বাংলা/ইংরেজিতে সার্চ (বিভাগ ও জেলা)
- কুইজ: (১) সাধারণ জ্ঞান ২৬টি প্রশ্ন (২) মানচিত্র কুইজ: হাইলাইট করা জেলা কোন বিভাগে। সেরা স্কোর browser-এ সেভ হয়
- মোবাইলে কাজ করে (touch দিয়ে ঘোরানো ও জুম)

## ফাইল কাঠামো

    server.py               Python server + ছোট API (/api/divisions, /api/quiz ...)
    build_data.py           Python: upazila GeoJSON থেকে বিভাগ ও জেলার সীমানা বানায় (shapely)
    data/raw/               মূল ডেটা (upazila GeoJSON, বিভাগ/জেলার তালিকা)
    public/index.html       পেজ
    public/css/style.css    ডিজাইন
    public/js/main.js       Three.js দিয়ে ৩ডি মানচিত্র, প্যানেল, সার্চ, কুইজ
    public/live.html + js/live.js   MapLibre লাইভ ম্যাপ (জুম ড্রিল-ডাউন)
    public/js/vendor/       Three.js r160 + OrbitControls (offline-এ চলে)
    public/data/            divisions.geojson, districts.geojson (তৈরি করা),
                            divisions_info.json (বাংলা তথ্য), quiz.json (প্রশ্ন)

## ব্যবহৃত প্রযুক্তি
HTML, CSS, JavaScript (ES modules), Three.js (৩ডি), MapLibre GL JS (লাইভ ম্যাপ), Python (server + data build, shapely), GeoJSON, JSON।

## তথ্য নিজে বাড়াতে/বদলাতে চাইলে
- বিভাগের তথ্য: `public/data/divisions_info.json` এডিট করুন
- কুইজ প্রশ্ন: `public/data/quiz.json`-এ প্রশ্ন যোগ করুন
  (`{"q": "...", "options": [4টি], "answer": সঠিক উত্তরের index (০ থেকে), "explain": "..."}`)
- মানচিত্র আবার বানাতে: `pip install shapely` তারপর `python build_data.py`

## সতর্কতা
- আয়তন ও জনসংখ্যা আনুমানিক (আদমশুমারি ২০২২ ও প্রচলিত সূত্র)। পরীক্ষার আগে BBS/বাংলাপিডিয়া থেকে মিলিয়ে নিন।
- মানচিত্রের সীমানা সরলীকৃত। শুধু শেখার জন্য, সরকারি/আইনি কাজের জন্য নয়।
- বিভাগ/জেলা ট্যাগহীন কিছু উপজেলা (মূল ডেটায় ১১৮টি) প্রতিবেশী দেখে বসানো হয়েছে। সীমান্তে সামান্য ভুল থাকতে পারে।

## ক্রেডিট ও লাইসেন্স
- সীমানা: geoBoundaries (CC BY 4.0), ভিত্তি BBS/OCHA। বিভাগ/জেলার নামের তালিকা: bangladesh-geojson (ODbL), দেখুন `data/raw/LICENSE-DATA.txt`
- MapLibre GL JS: BSD-3 (`public/js/vendor/maplibre/LICENSE.txt`); বেসম্যাপ © OpenStreetMap contributors / OpenFreeMap; স্যাটেলাইট Esri; terrain Mapzen/AWS
- Three.js: MIT (`public/js/vendor/THREE-LICENSE.txt`)

## পরের ধাপ (চাইলে)
উপজেলা পর্যায়, আরও কুইজ, Firebase দিয়ে লগইন ও স্কোর সেভ, PWA (অফলাইন মোবাইল অ্যাপ)।
