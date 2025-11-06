import type { ItemCard } from "../lib/types";

export type CardProps = {
  title: string;
  sub?: string;
  img?: string;
  meta?: string;
  href?: string;
  rawLink?: boolean;
};

const isNonEmpty = (value: string | undefined): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

export const createCard = ({
  title,
  sub,
  img,
  meta,
  href,
  rawLink = false,
}: CardProps): HTMLElement => {
  const card = document.createElement("article");
  card.className = "card";

  if (typeof img === "string" && img.length > 0) {
    const media = document.createElement("div");
    media.className = "card__media";

    const image = document.createElement("img");
    image.src = img;
    image.alt = title;

    media.appendChild(image);
    card.appendChild(media);
  }

  const body = document.createElement("div");
  body.className = "card__body";

  const titleEl = document.createElement("h3");
  titleEl.className = "card__title";

  if (typeof href === "string" && href.length > 0) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = title;
    if (!rawLink) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }
    titleEl.appendChild(link);
  } else {
    titleEl.textContent = title;
  }

  body.appendChild(titleEl);

  if (typeof sub === "string" && sub.length > 0) {
    const subtitle = document.createElement("p");
    subtitle.className = "card__subtitle";
    subtitle.textContent = sub;
    body.appendChild(subtitle);
  }

  if (typeof meta === "string" && meta.length > 0) {
    const metaEl = document.createElement("p");
    metaEl.className = "card__meta";
    metaEl.textContent = meta;
    body.appendChild(metaEl);
  }

  card.appendChild(body);

  return card;
};

const buildMeta = (item: ItemCard): string | undefined => {
  const parts: string[] = [];

  if (isNonEmpty(item.date)) {
    parts.push(item.date.trim());
  }

  if (Array.isArray(item.tags) && item.tags.length > 0) {
    const tags = item.tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (tags.length > 0) {
      parts.push(tags.join(", "));
    }
  }

  return parts.length > 0 ? parts.join(" • ") : undefined;
};

export const renderItemCard = (item: ItemCard): HTMLElement => {
  return createCard({
    title: item.title,
    sub: isNonEmpty(item.sub) ? item.sub : undefined,
    img: isNonEmpty(item.img) ? item.img : undefined,
    meta: buildMeta(item),
    href: isNonEmpty(item.href) ? item.href : undefined,
  });
};
