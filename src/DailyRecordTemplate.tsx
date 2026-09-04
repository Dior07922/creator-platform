import {
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Values = {
  left: string;
  right: string;
  bottom: string;
};

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

const EMPTY_VALUES: Values = {
  left: "",
  right: "",
  bottom: "",
};

export function DailyRecordTemplate({
  preview = false,
}: {
  preview?: boolean;
}) {
  const storageKey =
    "ranjing.cloud.daily-record-template.v1";

  const wrapRef =
    useRef<HTMLDivElement>(null);

  const [scale, setScale] =
    useState(1);

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

      if (availableWidth <= 0) return;

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

  const textStyle: React.CSSProperties = {
    border: 0,
    outline: 0,
    resize: "none",
    background: "transparent",
    color: "#514b45",
    fontFamily:
      '"Songti SC","STSong",serif',
    fontSize: 13,
    lineHeight: 1.8,
    padding: 0,
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
            width: A4_WIDTH * scale,
            height: A4_HEIGHT * scale,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              position: "relative",
              width: A4_WIDTH,
              height: A4_HEIGHT,
              boxSizing: "border-box",
              background: "#fff",
              transform:
                `scale(${scale})`,
              transformOrigin:
                "top left",
              overflow: "hidden",
            }}
          >
            <h3
              style={{
                position: "absolute",
                top: 20,
                left: 0,
                width: "100%",
                margin: 0,
                textAlign: "center",
                fontSize: 20,
                fontWeight: 400,
              }}
            >
              今日记录模板
            </h3>

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 54,
                height: 1,
                background:
                  "rgba(81,75,69,.75)",
              }}
            />

            <textarea
              aria-label="左侧记录"
              value={values.left}
              onChange={(e) =>
                update(
                  "left",
                  e.target.value
                )
              }
              placeholder="文字框左边"
              style={{
                ...textStyle,
                position: "absolute",
                left: 0,
                top: 80,
                width: 150,
                height: 240,
              }}
            />

            <div
              style={{
                position: "absolute",
                left: 161,
                top: 56,
                width: 250,
                height: 263,
                overflow: "hidden",
                background: "#fafafa",
              }}
            >
              <img
                src="/templates/daily-record-center.jpg"
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>

            <textarea
              aria-label="右侧记录"
              value={values.right}
              onChange={(e) =>
                update(
                  "right",
                  e.target.value
                )
              }
              placeholder="文字框右边"
              style={{
                ...textStyle,
                position: "absolute",
                left: 433,
                top: 67,
                width: 153,
                height: 249,
              }}
            />

            <textarea
              aria-label="下方记录"
              value={values.bottom}
              onChange={(e) =>
                update(
                  "bottom",
                  e.target.value
                )
              }
              placeholder="文字框下面"
              style={{
                ...textStyle,
                position: "absolute",
                left: 0,
                top: 329,
                width: 595,
                height: 513,
                padding: "0 2px",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}