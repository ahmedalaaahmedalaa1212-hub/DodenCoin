from flask import Flask, send_from_directory, jsonify, request
import os, time

app = Flask(__name__)
WEB_DIR = os.path.join(os.path.dirname(__file__), "web")

MINING_INTERVAL = 15 * 60
users = {}

@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")

@app.route("/mine", methods=["POST"])
def mine():
    user_id = str(request.json["user_id"])
    now = int(time.time())
    u = users.get(user_id, {"points": 0, "last": 0})

    if now - u["last"] < MINING_INTERVAL:
        return jsonify({
            "points": u["points"],
            "wait": MINING_INTERVAL - (now - u["last"])
        })

    u["points"] += 1
    u["last"] = now
    users[user_id] = u
    return jsonify({"points": u["points"], "wait": MINING_INTERVAL})

@app.route("/balance", methods=["POST"])
def balance():
    user_id = str(request.json["user_id"])
    return jsonify({"points": users.get(user_id, {}).get("points", 0)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
