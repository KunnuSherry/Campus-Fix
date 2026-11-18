import random
import hashlib

ADJECTIVES = [
    "Blue", "Red", "Green", "Golden", "Silver", "Silent", "Swift", "Brave",
    "Clever", "Fierce", "Noble", "Shadow", "Cosmic", "Astral", "Crimson",
    "Amber", "Iron", "Wild", "Frost", "Mystic", "Electric", "Solar", "Lunar"
]

ANIMALS = [
    "Falcon", "Tiger", "Eagle", "Wolf", "Panther", "Hawk", "Phoenix",
    "Otter", "Fox", "Bear", "Raven", "Dolphin", "Badger", "Cheetah",
    "Jaguar", "Lion", "Stallion", "Owl", "Bison", "Leopard", "Viper"
]

def generate_pseudonym() -> str:
    """
    Generates a student pseudonym, e.g. 'Blue Falcon 214' or 'Red Tiger 502'.
    """
    adj = random.choice(ADJECTIVES)
    animal = random.choice(ANIMALS)
    num = random.randint(101, 999)
    return f"{adj} {animal} {num}"


def extract_email_local_part(email: str) -> str:
    """
    Report-only name rule:
    If the account email is something like kunal123@bpitindia.in,
    extract and return the local part 'kunal123'.
    Never include the domain.
    """
    if not email:
        return "Student"
    return email.split("@")[0].strip()


def generate_author_hash(user_id: str, college_id: str) -> str:
    """
    Generates a non-reversible hash for distinct student counting in Admin Insights.
    Preserves complete student anonymity.
    """
    salt = "CampusFix_Privacy_Salt_2026"
    raw = f"{salt}:{college_id}:{user_id}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

