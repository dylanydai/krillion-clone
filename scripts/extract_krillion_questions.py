import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

BASE_URL = "https://krillionguide.com"
ARCHIVE_URL = f"{BASE_URL}/en/archive"
QUESTIONS_PER_DIVE = 7
REQUEST_TIMEOUT_SECONDS = 30
DOWNLOAD_WORKERS = 3
OUTPUT_DIRECTORY = Path(__file__).resolve().parent.parent
KNOWN_MISSING_QUESTIONS = {f"{BASE_URL}/en/answers/2026-09-21": [5]}


@dataclass(frozen=True)
class Question:
    number: int
    text: str


@dataclass(frozen=True)
class Dive:
    date: str
    source: str
    questions: list[Question]
    missing_question_numbers: list[int]


class ArchiveParser(HTMLParser):
    paths: set[str]
    declared_counts: set[int]

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paths = set()
        self.declared_counts = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            for name, value in attrs:
                if (
                    name == "href"
                    and value is not None
                    and re.fullmatch(r"/en/answers/\d{4}-\d{2}-\d{2}", value)
                ):
                    self.paths.add(value)

    def handle_data(self, data: str) -> None:
        count = re.fullmatch(r"\s*(\d+) dives\s*", data)
        if count is not None:
            self.declared_counts.add(int(count.group(1)))


class QuestionParser(HTMLParser):
    questions: list[Question]
    parts: list[str]
    in_heading: bool
    label_parts: list[str]
    in_label: bool
    pending_number: int | None

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.questions = []
        self.parts = []
        self.in_heading = False
        self.label_parts = []
        self.in_label = False
        self.pending_number = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "p":
            self.in_label = True
            self.label_parts = []
        if tag == "h2":
            if self.in_heading:
                raise ValueError("Nested question headings encountered.")
            self.in_heading = True
            self.parts = []

    def handle_data(self, data: str) -> None:
        if self.in_heading:
            self.parts.append(data)
        if self.in_label:
            self.label_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "p" and self.in_label:
            label = re.match(r"\s*#\s*(\d+)\s*·", "".join(self.label_parts))
            if label is not None:
                self.pending_number = int(label.group(1))
            self.in_label = False
        if tag == "h2" and self.in_heading:
            if self.pending_number is None:
                raise ValueError("Question heading without a numbered label.")
            self.questions.append(
                Question(
                    number=self.pending_number,
                    text=" ".join("".join(self.parts).split()),
                )
            )
            self.pending_number = None
            self.in_heading = False


def fetch_html(url: str) -> str:
    request = Request(url=url, headers={"User-Agent": "KrillionQuestionExtractor/1.0"})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8")


def parse_archive(html: str) -> list[str]:
    parser = ArchiveParser()
    parser.feed(html)
    parser.close()
    if not parser.paths or parser.declared_counts != {len(parser.paths)}:
        raise ValueError(
            f"Archive count mismatch: {len(parser.paths)} linked dives; "
            f"displayed counts: {sorted(parser.declared_counts)}."
        )
    return sorted(parser.paths)


def parse_questions(html: str, source: str) -> list[Question]:
    parser = QuestionParser()
    parser.feed(html)
    parser.close()
    numbers = [question.number for question in parser.questions]
    expected = list(range(1, QUESTIONS_PER_DIVE + 1))
    if numbers != expected and source in KNOWN_MISSING_QUESTIONS:
        expected = [
            number
            for number in expected
            if number not in KNOWN_MISSING_QUESTIONS[source]
        ]
    if parser.in_heading or numbers != expected:
        raise ValueError(
            f"{source}: expected question numbers {expected}, found {numbers}."
        )
    if any(not question.text for question in parser.questions):
        raise ValueError(f"{source}: empty question heading.")
    return parser.questions


def extract_dive(path: str) -> Dive:
    source = f"{BASE_URL}{path}"
    questions = parse_questions(html=fetch_html(url=source), source=source)
    present = {question.number for question in questions}
    missing = [
        number for number in range(1, QUESTIONS_PER_DIVE + 1) if number not in present
    ]
    return Dive(
        date=path.rsplit("/", maxsplit=1)[1],
        source=source,
        questions=questions,
        missing_question_numbers=missing,
    )


def main() -> None:
    paths = parse_archive(html=fetch_html(url=ARCHIVE_URL))
    dives: list[Dive] = []
    with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
        for dive in executor.map(extract_dive, paths):
            dives.append(dive)
            print(
                f"Validated {dive.date}: {len(dive.questions)} questions ({len(dives)}/{len(paths)})",
                flush=True,
            )
            if dive.missing_question_numbers:
                print(
                    f"SOURCE GAP: {dive.source} omits questions {dive.missing_question_numbers}.",
                    flush=True,
                )
    text = "\n\n".join(
        f"{dive.date}\n{dive.source}\n"
        + "\n".join(
            f"{question.number}. {question.text}" for question in dive.questions
        )
        + (
            f"\nMissing from source: question {dive.missing_question_numbers}"
            if dive.missing_question_numbers
            else ""
        )
        for dive in dives
    )
    (OUTPUT_DIRECTORY / "krillion-archive-questions.txt").write_text(
        text + "\n", encoding="utf-8"
    )
    (OUTPUT_DIRECTORY / "krillion-archive-questions.json").write_text(
        json.dumps([asdict(dive) for dive in dives], ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print(
        f"Saved {len(dives)} dives and {sum(len(dive.questions) for dive in dives)} questions."
    )


if __name__ == "__main__":
    main()
