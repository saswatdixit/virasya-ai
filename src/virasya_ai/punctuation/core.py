import re
from typing import Dict, Any

class PunctuationRestorer:
    def __init__(self, model_id: str = "Horizon-Labs/punctuation-restoration-base"):
        self.model_id = model_id
        self._pipe = None
        self._id2label = None
        self._tokenizer = None

    def _load_model(self):
        if self._pipe is None:
            from transformers import pipeline, AutoTokenizer, AutoModelForTokenClassification

            self._tokenizer = AutoTokenizer.from_pretrained(self.model_id)
            model = AutoModelForTokenClassification.from_pretrained(self.model_id)
            self._id2label = model.config.id2label
            self._pipe = pipeline("token-classification", model=model, tokenizer=self._tokenizer, device=-1)

    def normalize_punctuation(self, text: str) -> str:
        """
        Replaces '.' with '।' if it is followed by a space or end of string.
        """
        return re.sub(r'\.(?=\s|$)', '।', text)

    def restore_punctuation(self, text: str) -> str:
        if not text.strip():
            return text

        self._load_model()
        
        token_predictions = self._pipe(text)
        
        insertions = {}
        for pred in token_predictions:
            label = pred['entity']
            if label != '0' and label != 'LABEL_0':
                punct = label
                if label.startswith('LABEL_'):
                    punct_idx = int(label.split('_')[1])
                    punct = self._id2label[punct_idx]
                
                if punct != '0':
                    end_pos = pred['end']
                    insertions[end_pos] = punct
        
        output = ""
        last_idx = 0
        for pos in sorted(insertions.keys()):
            output += text[last_idx:pos]
            output += insertions[pos]
            last_idx = pos
        output += text[last_idx:]
        
        normalized = self.normalize_punctuation(output)
        return normalized

def punctuate_task(task_data: Dict[str, Any]) -> Dict[str, Any]:
    verified = task_data.get('verified_transcript')
    if not verified:
        raise ValueError("Task does not have a verified_transcript to punctuate.")
        
    restorer = PunctuationRestorer()
    punctuated = restorer.restore_punctuation(verified)
    
    task_data['punctuated_model_text'] = punctuated
    task_data['punctuated_final_text'] = punctuated
    return task_data
