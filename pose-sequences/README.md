# pose-sequences

신호수 동작 영상에서 추출된 프레임별 자세 데이터(JSON)를 저장하는 폴더입니다.

## 파일 추가 방법

1. `pose-extract.html` 접속 (관리자용)
2. 신호수 동작 영상 파일 업로드
3. [자세 추출 시작] 클릭 → 처리 완료 후 JSON 다운로드
4. 다운로드된 JSON을 이 폴더에 저장 (예: `stop_right.json`)
5. `pose-data.json`에서 해당 동작의 `"sequence"` 경로 업데이트

## JSON 구조

```json
{
  "id": "stop_right",
  "fps": 10,
  "duration": 5.2,
  "frames": [
    { "time": 0.0, "landmarks": [ {"x": 0.5, "y": 0.3, "z": 0.0, "visibility": 0.99}, ... ] },
    { "time": 0.1, "landmarks": [ ... ] }
  ]
}
```
