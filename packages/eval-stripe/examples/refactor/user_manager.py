"""user_manager.py — manages users. Written in a hurry. Do not judge."""

import json

USERS = []
NEXT_ID = 1


def add_user(name, email, roles=[]):
    global NEXT_ID
    if name == None or name == "":
        print("error: no name")
        return None
    if email == None or email == "":
        print("error: no email")
        return None
    if "@" not in email:
        print("error: bad email")
        return None
    for u in USERS:
        if u["email"] == email:
            print("error: email exists")
            return None
    user = {
        "id": NEXT_ID,
        "name": name,
        "email": email,
        "roles": roles,
        "active": True,
    }
    USERS.append(user)
    NEXT_ID = NEXT_ID + 1
    return user


def get_user(id):
    for u in USERS:
        if u["id"] == id:
            return u
    return None


def get_users_by_role(role):
    result = []
    for u in USERS:
        if u["active"] == True:
            if role in u["roles"]:
                result.append(u)
    return result


def remove_user(id):
    for i in range(len(USERS)):
        if USERS[i]["id"] == id:
            USERS.pop(i)
            return True
    return False


def deactivate_user(id):
    for u in USERS:
        if u["id"] == id:
            u["active"] = False
            return True
    return False


def activate_user(id):
    for u in USERS:
        if u["id"] == id:
            u["active"] = True
            return True
    return False


def update_email(id, email):
    if email == None or email == "":
        print("error: no email")
        return False
    if "@" not in email:
        print("error: bad email")
        return False
    for u in USERS:
        if u["email"] == email:
            if u["id"] != id:
                print("error: email exists")
                return False
    for u in USERS:
        if u["id"] == id:
            u["email"] = email
            return True
    return False


def save_to_file(path):
    f = open(path, "w")
    f.write(json.dumps(USERS))
    f.close()


def load_from_file(path):
    global USERS, NEXT_ID
    f = open(path, "r")
    data = f.read()
    f.close()
    USERS = json.loads(data)
    m = 0
    for u in USERS:
        if u["id"] > m:
            m = u["id"]
    NEXT_ID = m + 1


def main():
    add_user("Alice", "alice@example.com", ["admin"])
    add_user("Bob", "bob@example.com", ["user"])
    add_user("Charlie", "charlie@example.com", ["admin", "user"])
    admins = get_users_by_role("admin")
    for a in admins:
        print(a["name"])
    save_to_file("users.json")


if __name__ == "__main__":
    main()
