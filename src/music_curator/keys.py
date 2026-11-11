"""A name as a key to compare by. Capitals, accents, spaces and punctuation don't count; the letters do, in any alphabet.

Names in Latin letters get the key they always had: "Björk" is bjork, "AC/DC" is acdc. Latin letters that don't come apart into
a plain letter and an accent (ø, ß, ł) are left out as they always were, so "Mø" is still m. Letters of other alphabets count
too: "Отпусти меня" and "Я тебя не отдам" each have a key of their own, where both used to come out empty and so the same.

What sits on a letter is an accent in some alphabets and makes another letter in others. Latin, Greek, Hebrew and Arabic are
read without theirs, the way those are often written: "Ελένη" is ΕΛΕΝΗ. Everywhere else the marks stay, because й is not и,
が is not か, and a Thai or Hindi word without its vowel signs is another word. The one exception is ё, which Russian writes
as е as often as not.
"""
import functools
import unicodedata

WRITTEN_WITHOUT = ("LATIN", "GREEK", "HEBREW", "ARABIC")  # alphabets whose marks are accents or points that writing often leaves off
LOOKS_LIKE = chr(0x3BC) + chr(0x3A9)  # the Greek small mu and capital omega
SIGNS = {0xB5: None, 0x2126: None}  # the micro and ohm signs. They'd come out as Greek letters, and "µ-Ziq" has always been ziq


@functools.lru_cache(maxsize=None)
def _mark(c):
    """Is this something that sits on a letter, not a letter itself?"""
    return unicodedata.category(c).startswith("M")


@functools.lru_cache(maxsize=None)
def _marks_stay(c):
    """Do the marks on this letter make it another letter?"""
    return not c.isascii() and c.isalpha() and not unicodedata.name(c, "LATIN").startswith(WRITTEN_WITHOUT + ("MODIFIER LETTER",))


@functools.lru_cache(maxsize=None)
def counts(c):
    """Is this character part of a key? Asked about one lower-case character that _plain has let through."""
    return "a" <= c <= "z" or "0" <= c <= "9" or (not c.isascii() and (c.isalnum() or _mark(c)) and not unicodedata.name(c, "").startswith(("LATIN", "MODIFIER LETTER")))


def _signs_off(s):
    """A name without the micro and ohm signs. People type those two as the Greek letters they look like, too: a mu or a capital omega alone among other letters is the sign, and goes the same way.
    In a Greek word it's a letter, and stays."""
    s = (s or "").translate(SIGNS)
    if any(c in LOOKS_LIKE for c in s) and not any(unicodedata.name(c, "").startswith("GREEK") for c in s if c not in LOOKS_LIKE):
        s = "".join(c for c in s if c not in LOOKS_LIKE)
    return s


def _plain(s):
    out, stay, under = [], False, ""
    for c in unicodedata.normalize("NFKD", _signs_off(s)):
        if _mark(c):
            if stay and not (c == chr(0x308) and under in "еЕ"):  # ё as е
                out.append(c)
        else:
            out.append(c)
            stay, under = _marks_stay(c), c
    return unicodedata.normalize("NFC", "".join(out).lower())


def norm(s):
    return "".join(c for c in _plain(s) if counts(c))


def plain(s):
    """Like norm, but no letter is left out for being a Latin one: ø and ß count, and so does an underscore. For telling two full names apart, not for looking one up."""
    return "".join(c for c in _plain(s) if c.isalnum() or c == "_" or _mark(c))


def words(s):
    """The words of a name, each as its key: "Three 'N One" is three, n, one."""
    return "".join(c if counts(c) else " " for c in _plain(s)).split()

