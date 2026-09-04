import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";

type Field = {
  id: string;
  label: string;
  placeholder?: string;
};

const basicFields: Field[] = [
  { id: "name", label: "姓名" },
  { id: "personality", label: "性格" },
  { id: "hobby", label: "爱好" },
  { id: "traits", label: "特点" },
  { id: "habit", label: "习惯" },
  {
    id: "favorite",
    label: "最喜欢什么",
    placeholder: "人 / 物 / 事 / 食",
  },
];

const soulQuestions: Field[] = [
  {
    id: "origin",
    label: "请你详细描述：名字的由来和代表了什么？",
  },
  {
    id: "personalityStory",
    label:
      "请你描述为什么是这样的性格，发生了什么？经历了什么？",
  },
  {
    id: "hobbyReason",
    label: "请你想想它会有什么爱好，为什么？",
  },
  {
    id: "traitImpression",
    label: "请你说出你脑海里“它”的特点印象。",
  },
  {
    id: "habitStory",
    label:
      "请你说出它有什么习惯，这种习惯它自己知道么？这种习惯怎么形成的？",
  },
  {
    id: "favoriteReason",
    label:
      "请你说出它最喜欢什么，人、物、事、食，择一并说出为什么。",
  },
  {
    id: "threeViews",
    label:
      "它在别人眼里、你的眼里、它自己眼里，分别是什么样的？",
  },
  {
    id: "presentSelf",
    label:
      "全部认真思考后，请写出现在的它，以及故事将从哪里开始。",
  },
];

const unlockedFields: Field[] = [
  { id: "finalName", label: "姓名" },
  { id: "age", label: "年龄" },
  { id: "role", label: "角色定位" },
  { id: "style", label: "行事风格" },
  { id: "attraction", label: "会被什么吸引" },
  { id: "ending", label: "结局" },
];

type Values = Record<string, string>;

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

export function NovelCharacterSoulTemplate({
  preview = false,
}: {
  preview?: boolean;
}) {
  const storageKey =
    "ranjing.cloud.novel-character-soul.v1";

  const previewWrapRef =
    useRef<HTMLDivElement>(null);

  const [sheetScale, setSheetScale] =
    useState(1);

  const [values, setValues] =
    useState<Values>(() => {
      if (
        preview ||
        typeof window === "undefined"
      ) {
        return {};
      }

      try {
        return JSON.parse(
          localStorage.getItem(storageKey) ||
            "{}"
        ) as Values;
      } catch {
        return {};
      }
    });

  useLayoutEffect(() => {
    const el = previewWrapRef.current;

    if (!el) return;

    const updateScale = () => {
      const availableWidth =
        el.clientWidth - 8;

      if (availableWidth <= 0) {
        return;
      }

      setSheetScale(
        Math.min(
          1,
          availableWidth / A4_WIDTH
        )
      );
    };

    updateScale();

    const observer =
      new ResizeObserver(updateScale);

    observer.observe(el);

    return () =>
      observer.disconnect();
  }, []);

  const unlocked = useMemo(
    () =>
      [
        ...basicFields,
        ...soulQuestions,
      ].every((field) =>
        values[field.id]?.trim()
      ),
    [values]
  );

  const completedCount =
    useMemo(
      () =>
        [
          ...basicFields,
          ...soulQuestions,
        ].filter((field) =>
          values[field.id]?.trim()
        ).length,
      [values]
    );

  const requiredCount =
    basicFields.length +
    soulQuestions.length;

  const update = (
    id: string,
    value: string
  ) => {
    const next = {
      ...values,
      [id]: value,
    };

    setValues(next);

    if (!preview) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(next)
        );
      } catch {
        /* noop */
      }
    }
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    minWidth: 0,
    border: 0,
    borderBottom:
      "1px solid rgba(128,107,92,.2)",
    background: "transparent",
    color: "#514b45",
    font: "inherit",
    outline: 0,
    padding: "5px 2px",
    boxSizing: "border-box",
  };

  const renderCard = (
    fields: Field[],
    disabled = false
  ) => (
    <div
      style={{
        position: "relative",
        height: 270,
        padding: 17,
        boxSizing: "border-box",
        border:
          "1px solid rgba(128,107,92,.14)",
        borderRadius: 8,
        background: "#f2efeb",
        overflow: "hidden",
      }}
    >
      <div
        aria-label="人物照片位置"
        style={{
          width: 76,
          height: 98,
          float: "right",
          margin: "0 0 12px 14px",
          borderRadius: 5,
          background: "#d9aaa7",
        }}
      />

      <div
        style={{
          display: "grid",
          gap: 9,
        }}
      >
        {fields.map((field) => (
          <label
            key={field.id}
            style={{
              display: "grid",
              gridTemplateColumns:
                "max-content minmax(0,1fr)",
              alignItems: "end",
              gap: 5,
              fontSize: 11,
            }}
          >
            <span>
              {field.label}：
            </span>

            <input
              aria-label={field.label}
              disabled={disabled}
              value={
                values[field.id] || ""
              }
              placeholder={
                field.placeholder
              }
              onChange={(event) =>
                update(
                  field.id,
                  event.target.value
                )
              }
              style={inputStyle}
            />
          </label>
        ))}
      </div>

      {disabled && (
        <div
          role="status"
          aria-label="人物卡未解锁"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "grid",
            placeItems: "center",
            padding: 24,
            boxSizing: "border-box",
            borderRadius: 8,
            background:
              "rgba(217,217,217,.96)",
            textAlign: "center",
            color: "#514b45",
          }}
        >
          <div>
            <div
              aria-hidden="true"
              style={{
                fontSize: 34,
                lineHeight: 1,
              }}
            >
              🔒
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: 11,
                lineHeight: 1.8,
              }}
            >
              左侧人物基础卡及 8 题
              <br />
              全部写完后自动解锁
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section
      style={{
        width: "100%",
        margin: "0 auto",
        color: "#514b45",
        fontFamily:
          '"Songti SC","STSong",serif',
      }}
    >
      {preview && (
        <div
          style={{
            marginBottom: 14,
            textAlign: "center",
            color: "#999189",
            fontFamily:
              "system-ui,sans-serif",
            fontSize: 10,
          }}
        >
          交互预览 ·
          输入仅用于体验，不会保存
        </div>
      )}

      <div
        ref={previewWrapRef}
        style={{
          width: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width:
              A4_WIDTH * sheetScale,
            height:
              A4_HEIGHT * sheetScale,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              width: A4_WIDTH,
              height: A4_HEIGHT,
              padding:
                "36px 42px 32px",
              boxSizing: "border-box",
              background: "#ffffff",
              color: "#514b45",
              transform: `scale(${sheetScale})`,
              transformOrigin:
                "top left",
              overflow: "hidden",
              boxShadow:
                "0 5px 24px rgba(55,45,34,.08)",
            }}
          >
            <h3
              style={{
                margin:
                  "0 0 24px",
                textAlign: "center",
                fontSize: 20,
                fontWeight: 400,
              }}
            >
              小说人物灵魂模板
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: 22,
              }}
            >
              {renderCard(
                basicFields
              )}

              {renderCard(
                unlockedFields,
                !unlocked
              )}
            </div>

            <div
              style={{
                display: "grid",
                gap: 0,
                marginTop: 24,
              }}
            >
              {soulQuestions.map(
                (
                  question,
                  index
                ) => (
                  <label
                    key={
                      question.id
                    }
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "1fr",
                      gap: 5,
                      padding:
                        "10px 4px",
                      borderTop:
                        "1px solid rgba(128,107,92,.17)",
                      fontSize: 11,
                      lineHeight: 1.6,
                    }}
                  >
                    <span>
                      {index + 1}.{" "}
                      {
                        question.label
                      }
                    </span>

                    <textarea
                      aria-label={`问题 ${
                        index + 1
                      }`}
                      value={
                        values[
                          question.id
                        ] || ""
                      }
                      onChange={(
                        event
                      ) =>
                        update(
                          question.id,
                          event
                            .target
                            .value
                        )
                      }
                      rows={1}
                      style={{
                        ...inputStyle,
                        minHeight: 34,
                        maxHeight: 58,
                        resize:
                          "vertical",
                        lineHeight: 1.6,
                      }}
                    />
                  </label>
                )
              )}
            </div>

            <div
              role="status"
              style={{
                marginTop: 15,
                padding:
                  "11px 14px",
                borderRadius: 8,
                background:
                  unlocked
                    ? "#ece6de"
                    : "#f6f2ec",
                color:
                  unlocked
                    ? "#5f554d"
                    : "#999189",
                fontFamily:
                  "system-ui,sans-serif",
                fontSize: 10,
                lineHeight: 1.7,
              }}
            >
              {unlocked
                ? "已完成基础卡与 8 个问题，右侧人物卡已解锁。你的人物有了灵魂，故事可以开始了。"
                : `完成进度：${completedCount} / ${requiredCount}`}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}