"""Friendly nicknames: an adjective and an animal ("Curious Otter").

When a room asks for friendly names, players pick from names the server suggests, so a
classroom or a company meeting never sees an inappropriate nickname on the big screen. The
same suggestions are on offer in any room as a "suggest a name" button.

58 x 60 = 3,480 two-word names; every word is short enough that the pair fits MAX_NAME (24).
"""

from __future__ import annotations

import secrets

ADJECTIVES = (
    "Agile",
    "Amber",
    "Bold",
    "Brave",
    "Breezy",
    "Bright",
    "Bubbly",
    "Calm",
    "Clever",
    "Cosmic",
    "Curious",
    "Daring",
    "Dashing",
    "Eager",
    "Epic",
    "Fancy",
    "Fearless",
    "Fluffy",
    "Friendly",
    "Gentle",
    "Giddy",
    "Glowing",
    "Golden",
    "Happy",
    "Jolly",
    "Keen",
    "Kind",
    "Lively",
    "Lucky",
    "Lunar",
    "Magic",
    "Mellow",
    "Mighty",
    "Nimble",
    "Noble",
    "Peppy",
    "Plucky",
    "Polite",
    "Quick",
    "Quiet",
    "Radiant",
    "Rapid",
    "Sassy",
    "Shiny",
    "Silly",
    "Smart",
    "Snappy",
    "Solar",
    "Sparkly",
    "Speedy",
    "Spry",
    "Steady",
    "Sunny",
    "Swift",
    "Tidy",
    "Witty",
    "Zany",
    "Zesty",
)
ANIMALS = (
    "Alpaca",
    "Badger",
    "Beaver",
    "Bison",
    "Bunny",
    "Camel",
    "Cheetah",
    "Chipmunk",
    "Cobra",
    "Condor",
    "Corgi",
    "Crane",
    "Dingo",
    "Dolphin",
    "Eagle",
    "Falcon",
    "Ferret",
    "Finch",
    "Gecko",
    "Gibbon",
    "Giraffe",
    "Gopher",
    "Heron",
    "Hippo",
    "Ibis",
    "Iguana",
    "Jackal",
    "Jaguar",
    "Koala",
    "Lemur",
    "Lion",
    "Llama",
    "Lynx",
    "Magpie",
    "Marmot",
    "Meerkat",
    "Mole",
    "Moose",
    "Narwhal",
    "Ocelot",
    "Orca",
    "Otter",
    "Owl",
    "Panda",
    "Parrot",
    "Pelican",
    "Penguin",
    "Puffin",
    "Quokka",
    "Rabbit",
    "Raccoon",
    "Raven",
    "Robin",
    "Seal",
    "Sloth",
    "Tapir",
    "Tiger",
    "Toucan",
    "Walrus",
    "Wombat",
)
_ADJ = {a.casefold() for a in ADJECTIVES}
_ANI = {a.casefold() for a in ANIMALS}
SUGGESTIONS = 3


def is_friendly(name: str) -> bool:
    """True when the nickname is one of the generated adjective + animal names."""
    parts = name.split()
    return len(parts) == 2 and parts[0].casefold() in _ADJ and parts[1].casefold() in _ANI


def suggest(taken: set[str], count: int = SUGGESTIONS) -> list[str]:
    """`count` different names nobody in the room uses yet (`taken` holds casefolded names)."""
    out: list[str] = []
    for _ in range(count * 40):
        name = f"{secrets.choice(ADJECTIVES)} {secrets.choice(ANIMALS)}"
        key = name.casefold()
        if key not in taken and name not in out:
            out.append(name)
            if len(out) == count:
                break
    return out
