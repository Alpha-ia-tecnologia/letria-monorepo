"""Speech delivery checks require neither models nor third-party packages."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent))
from prosody import conservative_edge_bounds, delivery_chunks, missing_join_silence, pause_after, prepare_spoken_text, quiet_edge_samples, voice_settings


class ProsodyTests(unittest.TestCase):
    def test_speed_and_pause_profiles_are_bounded_and_deterministic(self):
        self.assertEqual(voice_settings().speed, 0.96)
        self.assertEqual(voice_settings("conversation").speed, 1.0)
        for profile in ("reading", "conversation"):
            natural = voice_settings(profile)
            calm = voice_settings(profile, "calm")
            self.assertEqual(calm.speed, 0.90)
            self.assertLess(calm.speed, natural.speed)
            self.assertGreater(calm.sentence_pause, natural.sentence_pause)
            self.assertGreater(calm.clause_pause, natural.clause_pause)
            self.assertGreaterEqual(natural.speed, 0.90)
            self.assertLessEqual(natural.speed, 1.0)
        for profile, pace in (("robot", "natural"), ("reading", "fast"), (None, "natural"), ("reading", [])):
            with self.assertRaises(ValueError):
                voice_settings(profile, pace)

    def test_conversation_keeps_a_greeting_with_its_context(self):
        text = "Oi! Eu sou a Lumi. Vamos descobrir uma pista juntos?"
        self.assertEqual(delivery_chunks(text, voice_settings("conversation")), [text])
        self.assertEqual(delivery_chunks(text, voice_settings()), ["Oi!", "Eu sou a Lumi.", "Vamos descobrir uma pista juntos?"])

    def test_context_packing_preserves_every_word_and_stays_under_hard_limit(self):
        text = "Oi! " + "Vamos observar as letras da palavra com bastante atenção. " * 25 + "Muito bem!"
        for profile in ("reading", "conversation"):
            chunks = delivery_chunks(text, voice_settings(profile))
            self.assertTrue(all(0 < len(chunk) <= 240 for chunk in chunks))
            self.assertEqual(" ".join(chunks), " ".join(text.split()))
        self.assertNotEqual(delivery_chunks(text, voice_settings("conversation"))[0], "Oi!")
        long_sentence = "Oi! " + "aprendizado " * 35 + "juntos."
        self.assertTrue(delivery_chunks(long_sentence, voice_settings("conversation"))[0].startswith("Oi! aprendizado"))
        with self.assertRaises(ValueError):
            delivery_chunks("a" * 241, voice_settings("conversation"))

    def test_reading_keeps_syllable_separators_accents_and_numbers(self):
        text = "Leia BA-NA-NA. Observe o PÉ e a MÃO! Agora, conte 3,5."
        chunks = delivery_chunks(text, voice_settings("reading"))
        self.assertEqual(chunks, ["Leia BA-NA-NA.", "Observe o PÉ e a MÃO!", "Agora, conte 3,5."])
        self.assertEqual(" ".join(chunks), text)

    def test_assistant_name_gets_spoken_stress_only_in_conversation(self):
        text = "Olá, sou a Lumi! Lumi pode ajudar a ler BA-NA-NA."
        for pace in ("natural", "calm"):
            self.assertEqual(prepare_spoken_text(text, voice_settings("reading", pace)), text)
            self.assertEqual(
                prepare_spoken_text(text, voice_settings("conversation", pace)),
                "Olá, sou a Lúmi! Lúmi pode ajudar a ler BA-NA-NA.",
            )

    def test_pronunciation_exception_preserves_case_and_similar_names(self):
        text = "Luminosa, Luminosidade, Luminária, Lumis, Alumi, LUMI, lumi, Lúmi e BA-NA-NA."
        self.assertEqual(prepare_spoken_text(text, voice_settings("conversation")), text)
        quoted = "A personagem (Lumi) disse: Oi, Lumi!"
        self.assertEqual(prepare_spoken_text(quoted, voice_settings("conversation")), "A personagem (Lúmi) disse: Oi, Lúmi!")

    def test_pause_rules_recognize_closing_quotes_without_overpausing_clauses(self):
        settings = voice_settings("conversation")
        self.assertEqual(pause_after("Vamos?" + chr(34), settings), settings.sentence_pause)
        self.assertEqual(pause_after("Pense…", settings), settings.sentence_pause)
        self.assertEqual(pause_after("Primeiro;", settings), settings.clause_pause)
        self.assertEqual(pause_after("Uma frase longa continua", settings), 0.04)

    def test_join_counts_the_silence_already_generated_by_the_model(self):
        left = [0.1] * 100 + [0.0] * 60
        right = [0.0] * 40 + [0.1] * 100
        self.assertEqual(missing_join_silence(left, right, 1000, 0.25), 150)
        self.assertEqual(missing_join_silence(left, right, 1000, 0.08), 0)
        self.assertEqual(missing_join_silence([0.1] * 10, [0.1] * 10, 1000, 0.1), 100)

    def test_conservative_trimming_keeps_margins_and_all_internal_silence(self):
        middle = [0.1] * 100 + [0.0] * 300 + [0.2] * 100
        samples = [0.0] * 300 + middle + [0.0] * 400
        start, end = conservative_edge_bounds(samples, 1000)
        self.assertEqual(samples[start:end], [0.0] * 60 + middle + [0.0] * 60)
        soft = [0.0006] * 300 + middle + [0.0006] * 300
        self.assertEqual(conservative_edge_bounds(soft, 1000), (0, len(soft)))

    def test_short_margins_empty_and_silent_inputs_are_not_cut_into_speech(self):
        short = [0.0] * 40 + [0.1] * 50 + [0.0] * 40
        self.assertEqual(conservative_edge_bounds(short, 1000), (0, len(short)))
        self.assertEqual(conservative_edge_bounds([], 1000), (0, 0))
        self.assertEqual(conservative_edge_bounds([0.0] * 1000, 1000), (0, 1000))
        self.assertEqual(quiet_edge_samples([0.0] * 2000, 1000, True), 600)


if __name__ == "__main__":
    unittest.main()
