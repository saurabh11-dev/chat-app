from pathlib import Path


class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end_of_word = False


class AbuseFilterTrie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str):
        cleaned = word.strip().lower()
        if not cleaned:
            return
        node = self.root
        for ch in cleaned:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end_of_word = True

    def load_from_file(self, filepath: Path):
        if not filepath.exists():
            return
        with filepath.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                self.insert(line)

    def _matches_from(self, text: str, start_idx: int) -> bool:
        node = self.root
        for i in range(start_idx, len(text)):
            ch = text[i]
            if ch not in node.children:
                return False
            node = node.children[ch]
            if node.is_end_of_word:
                next_char = text[i + 1] if i + 1 < len(text) else ""
                if not next_char.isalnum():
                    return True
        return False

    def contains_abuse(self, text: str) -> bool:
        if not text:
            return False
        normalized = text.lower()
        for i in range(len(normalized)):
            prev_char = normalized[i - 1] if i > 0 else ""
            if i == 0 or not prev_char.isalnum():
                if self._matches_from(normalized, i):
                    return True
        return False


WORDLIST_PATH = Path(__file__).resolve().parent / "data" / "abusive_words.txt"
abuse_trie = AbuseFilterTrie()
abuse_trie.load_from_file(WORDLIST_PATH)


def has_abusive_content(message: str) -> bool:
    return abuse_trie.contains_abuse(message)