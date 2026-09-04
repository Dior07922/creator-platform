import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type Values = {
  name: string;
  age: string;
  personality: string;
  traits: string;
  event: string;
  outline: string;
};

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

const EMPTY_VALUES: Values = {
  name: "",
  age: "",
  personality: "",
  traits: "",
  event: "",
  outline: "",
};

export function NovelStoryOutlineTemplate({
  preview = false,
}: {
  preview?: boolean;
}) {
  const storageKey =
    "ranjing.cloud.novel-story-outline.v1";

  const wrapRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);

  const [values, setValues] =
    useState<Values>(() => {
      if (
        preview ||
        typeof window === "undefined"
      ) {
        return EMPTY_VALUES;
      }

      try {
        return {
          ...EMPTY_VALUES,
          ...JSON.parse(
            localStorage.getItem(
              storageKey
            ) || "{}"
          ),
        };
      } catch {
        return EMPTY_VALUES;
      }
    });

  useLayoutEffect(() => {
    const el = wrapRef.current;

    if (!el) return;

    const updateScale = () => {
      const availableWidth =
        el.clientWidth - 8;

      if (availableWidth <= 0) {
        return;
      }

      setScale(
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

  const update = (
    key: keyof Values,
    value: string
  ) => {
    const next = {
      ...values,
      [key]: value,
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
      "1px solid rgba(128,107,92,.22)",
    background: "transparent",
    color: "#514b45",
    font: "inherit",
    outline: 0,
    padding: "4px 2px",
    boxSizing: "border-box",
  };

  return (
    <section
      style={{
        width: "100%",
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
        ref={wrapRef}
        style={{
          width: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width:
              A4_WIDTH * scale,
            height:
              A4_HEIGHT * scale,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              width: A4_WIDTH,
              height: A4_HEIGHT,
              boxSizing: "border-box",
              background: "#fff",
              color: "#514b45",
              transform:
                `scale(${scale})`,
              transformOrigin:
                "top left",
              overflow: "hidden",
              boxShadow:
                "0 5px 24px rgba(55,45,34,.08)",
            }}
          >
            <h3
              style={{
                height: 46,
                margin: 0,
                display: "grid",
                placeItems: "center",
                borderBottom:
                  "1px solid rgba(81,75,69,.7)",
                fontSize: 20,
                fontWeight: 400,
              }}
            >
              小说模板
            </h3>

            <div
              style={{
                padding:
                  "8px 14px 0",
                fontSize: 13,
              }}
            >
              故事围绕谁展开
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "171px 1fr",
                gap: 9,
                padding:
                  "10px 8px 0",
              }}
            >
              <div
                style={{
                  height: 179,
                  padding:
                    "12px 10px",
                  boxSizing:
                    "border-box",
                  background:
                    "#d9d9d9",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "48px 1fr",
                    gap: 10,
                  }}
                >
                  <div
                    aria-label="人物头像位置"
                    style={{
                      width: 46,
                      height: 50,
                      borderRadius:
                        "50%",
                      background:
                        "#bd8f8c",
                    }}
                  />

                  <div
                    style={{
                      display: "grid",
                      gap: 5,
                      fontSize: 13,
                    }}
                  >
                    <label>
                      名字：
                      <input
                        aria-label="名字"
                        value={
                          values.name
                        }
                        onChange={(
                          event
                        ) =>
                          update(
                            "name",
                            event
                              .target
                              .value
                          )
                        }
                        style={
                          inputStyle
                        }
                      />
                    </label>

                    <label>
                      年龄：
                      <input
                        aria-label="年龄"
                        value={
                          values.age
                        }
                        onChange={(
                          event
                        ) =>
                          update(
                            "age",
                            event
                              .target
                              .value
                          )
                        }
                        style={
                          inputStyle
                        }
                      />
                    </label>

                    <label>
                      性格：
                      <input
                        aria-label="性格"
                        value={
                          values.personality
                        }
                        onChange={(
                          event
                        ) =>
                          update(
                            "personality",
                            event
                              .target
                              .value
                          )
                        }
                        style={
                          inputStyle
                        }
                      />
                    </label>

                    <label>
                      特征：
                      <input
                        aria-label="特征"
                        value={
                          values.traits
                        }
                        onChange={(
                          event
                        ) =>
                          update(
                            "traits",
                            event
                              .target
                              .value
                          )
                        }
                        style={
                          inputStyle
                        }
                      />
                    </label>
                  </div>
                </div>

                <label
                  style={{
                    display: "grid",
                    gap: 4,
                    marginTop: 9,
                    fontSize: 13,
                  }}
                >
                  经历影响她的事件：
                  <textarea
                    aria-label="经历影响她的事件"
                    value={
                      values.event
                    }
                    onChange={(
                      event
                    ) =>
                      update(
                        "event",
                        event
                          .target
                          .value
                      )
                    }
                    rows={2}
                    style={{
                      ...inputStyle,
                      resize: "none",
                      lineHeight: 1.5,
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  height: 177,
                  padding:
                    "10px 38px 14px",
                  boxSizing:
                    "border-box",
                  background:
                    "#d9d9d9",
                }}
              >
                <div
                  style={{
                    textAlign:
                      "center",
                    fontSize: 13,
                    marginBottom: 18,
                  }}
                >
                  故事大纲
                </div>

                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  请用100以内的语言讲出你的故事
                  <br />
                  让人通过100字就知道要看的是什么故事
                  <br />
                  引起读者兴趣
                  说明你成功了
                  <br />
                  接下来是你开始的时候了
                </div>

                <textarea
                  aria-label="故事大纲"
                  value={
                    values.outline
                  }
                  maxLength={100}
                  onChange={(
                    event
                  ) =>
                    update(
                      "outline",
                      event
                        .target
                        .value
                    )
                  }
                  rows={4}
                  placeholder="在这里写下 100 字以内的故事大纲……"
                  style={{
                    ...inputStyle,
                    minHeight: 58,
                    marginTop: 10,
                    resize: "none",
                    lineHeight: 1.6,
                  }}
                />

                <div
                  style={{
                    marginTop: 4,
                    textAlign: "right",
                    color: "#8f8880",
                    fontSize: 10,
                  }}
                >
                  {
                    values.outline
                      .length
                  }{" "}
                  / 100
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}