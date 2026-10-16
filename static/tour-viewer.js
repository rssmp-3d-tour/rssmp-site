(() => {
  'use strict';

  // 3D-тур на Photo Sphere Viewer (vendor/psv.js, лицензия MIT). Движок показывает
  // панораму и отвечает за перетаскивание, инерцию, колесо и масштаб двумя пальцами.
  // Точки, карточки, экскурсия, гироскоп, VR и эффект присутствия — код сайта ниже.
  const root = document.querySelector('[data-tour-viewer]');
  if (!root) return;

  // The tour fills the rest of the first screen: style.css sets its height to the
  // window height minus --tour-offset, the distance from the top of the page.
  function fitToScreen() {
    if (root.classList.contains('is-pseudo-fullscreen') || document.fullscreenElement || document.webkitFullscreenElement) return;
    root.style.setProperty('--tour-offset', `${Math.round(root.getBoundingClientRect().top + window.scrollY + 16)}px`);
  }
  fitToScreen();
  window.addEventListener('resize', fitToScreen, { passive: true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(fitToScreen);
    for (const element of [document.querySelector('header'), document.querySelector('.tour-intro')]) if (element) observer.observe(element);
  }

  const fallback = root.querySelector('[data-tour-fallback]');
  const statusLine = root.querySelector('[data-vr-status]');
  const announcer = root.querySelector('[data-tour-announce]');
  let statusTimer = 0;
  const setStatus = text => {
    if (!statusLine) return;
    statusLine.textContent = text;
    clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(() => { statusLine.textContent = ''; }, 6000);
  };
  const announce = text => { if (announcer) announcer.textContent = text; };
  function showFallback(title, text, canRetry = false) {
    fallback.hidden = false;
    fallback.querySelector('strong').textContent = title;
    fallback.querySelector('span').textContent = text;
    const retry = fallback.querySelector('[data-tour-retry]');
    if (retry) retry.hidden = !canRetry;
    root.classList.remove('is-loading', 'is-switching', 'is-approaching', 'is-sharpening');
    root.removeAttribute('aria-busy');
    announce(`${title} ${text}`);
  }

  // The engine draws into its own element; older markup had a bare <canvas> instead.
  root.querySelector(':scope > canvas')?.remove();
  let stage = root.querySelector('[data-tour-stage]');
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'tour-psv';
    stage.setAttribute('data-tour-stage', '');
    stage.setAttribute('aria-hidden', 'true');
    root.prepend(stage);
  }
  const PSV = window.RssmpPSV;
  if (!PSV || !PSV.Viewer) {
    showFallback('Не удалось загрузить модуль 3D-тура.', 'Обновите страницу. Если ошибка повторится, откройте сайт в другом браузере.', true);
    fallback.querySelector('[data-tour-retry]')?.addEventListener('click', () => location.reload());
    return;
  }

  const vehicles = {
    b: { title: 'Автомобиль класса B', short: 'Класс B' },
    c: { title: 'Реанимобиль класса C', short: 'Класс C' }
  };

  // Автомобили станции сняты 9 октября 2026 года: точки стоят на фактическом оборудовании.
  // Модели автомобилей и оборудования в описаниях не названы до подтверждения станцией.
  const scenes = {
    'b-yard': {
      vehicle: 'b', view: 'yard',
      title: 'Двор станции',
      image: '/assets/tour-b-yard.jpg',
      yaw: -1.37,
      pitch: 0.02,
      hotspots: [
        { yaw: 0.2, pitch: 0.27, title: 'Здание станции', text: 'Здание Республиканской станции скорой медицинской помощи в Грозном.' },
        { yaw: -1.57, pitch: 0.04, title: 'Автомобиль класса B', text: 'Автомобиль скорой медицинской помощи для работы выездной бригады. Марка, модель и комплектация будут указаны после подтверждения станцией.' },
        { yaw: -1.4, pitch: 0.01, title: 'Кабина водителя', text: 'Кабина отделена от медицинского салона. Здесь расположены органы управления автомобилем и средствами связи.' },
        { yaw: -1.78, pitch: -0.2, title: 'Ступень бокового входа', text: 'Ступень у бокового входа облегчает вход в медицинский салон и выход из него.' },
        { yaw: -2.16, pitch: 0.0, title: 'Задние двери', text: 'Обойти автомобиль и подойти к задним дверям медицинского салона.', next: 'b-exterior', action: 'Обойти к задним дверям' },
        { yaw: -1.78, pitch: 0.05, title: 'Боковая дверь медицинского салона', text: 'Войти в медицинский салон через боковую дверь.', next: 'b-interior', action: 'Войти в салон' }
      ]
    },
    'b-exterior': {
      vehicle: 'b', view: 'exterior',
      title: 'Автомобиль класса B · сзади',
      image: '/assets/tour-b-exterior.jpg',
      yaw: -1.45,
      pitch: 0.02,
      hotspots: [
        { yaw: -1.55, pitch: 0.08, title: 'Медицинский салон', text: 'Войти в медицинский салон через задние двери.', next: 'b-interior', action: 'Войти в салон' },
        { yaw: -1.16, pitch: 0.82, title: 'Светозвуковая сигнализация', text: 'На крыше расположены элементы светозвуковой сигнализации автомобиля скорой медицинской помощи.' },
        { yaw: -1.55, pitch: -0.27, title: 'Доступ в медицинский салон', text: 'Задний вход ведёт в медицинский салон и к зоне размещения носилок.' },
        { yaw: -1.94, pitch: 0.24, title: 'Баллон с редуктором', text: 'В шкафу у задних дверей закреплён баллон. Сверху видны вентиль баллона и редуктор с манометром, от редуктора отходит шланг. Манометр показывает давление в баллоне, редуктор понижает его до рабочего. Корпус баллона закрыт панелью шкафа: вероятно, это кислородный баллон, как в реанимобиле класса C. Тип газа, объём баллона и модель редуктора будут указаны после подтверждения станцией.' },
        { yaw: -2.42, pitch: 0.25, title: 'Кресло для переноски пациента', text: 'Складное кресло закреплено на внутренней стороне задней двери.' },
        { yaw: -0.62, pitch: 0.12, title: 'Задняя дверь медицинского салона', text: 'Распашные створки открывают доступ к зоне размещения и фиксации носилок.' },
        { yaw: -0.87, pitch: -0.63, title: 'Двор станции', text: 'Обойти автомобиль справа и вернуться во двор станции, к боковой двери.', next: 'b-yard', action: 'Вернуться во двор' }
      ]
    },
    'b-interior': {
      vehicle: 'b', view: 'interior',
      title: 'Автомобиль класса B · медицинский салон',
      image: '/assets/tour-b-interior.jpg',
      yaw: -1.4,
      pitch: -0.05,
      hotspots: [
        { yaw: -1.34, pitch: -0.03, title: 'Аппарат искусственной вентиляции лёгких', text: 'Предназначен для респираторной поддержки пациента. Режимы работы зависят от конкретной модели.' },
        { yaw: -1.22, pitch: 0.17, title: 'Кислородная система', text: 'Обеспечивает размещение и подключение кислородного оборудования. Точный состав зависит от комплектации автомобиля.' },
        { yaw: -1.96, pitch: -0.5, title: 'Система носилок', text: 'Предназначена для перемещения пациента и фиксации носилок в медицинском салоне.' },
        { yaw: -1.79, pitch: -0.14, title: 'Сумка экстренной помощи', text: 'Переносная медицинская укладка позволяет доставить необходимые средства непосредственно к пациенту.' },
        { yaw: -1.8, pitch: 0.08, title: 'Медицинская укладка на верхней полке', text: 'Переносная укладка хранится в закреплённой зоне верхней полки.' },
        { yaw: -1.66, pitch: -0.13, title: 'Дополнительная медицинская укладка', text: 'Компактная переносная сумка размещена рядом с основной укладкой.' },
        { yaw: -1.38, pitch: -0.3, title: 'Медицинская укладка у рабочего места', text: 'Переносная сумка расположена под стационарным оборудованием.' },
        { yaw: -1.57, pitch: -0.42, title: 'Сумка в нижнем отсеке', text: 'Мягкая тёмно-синяя сумка хранится в нижнем отсеке под рабочей полкой.' },
        { yaw: -1.42, pitch: -0.49, title: 'Аппарат в нижнем отсеке', text: 'Рядом с сумкой стоит переносной аппарат в светлом корпусе с прозрачными трубками. На снимке он частично закрыт ремнём и шлангом, поэтому тип и модель не определить. Назначение будет указано после подтверждения станцией.' },
        { yaw: -1.2, pitch: -0.63, title: 'Сейф', text: 'Металлический сейф с надписью «SECURITY 11» закреплён в нижнем отсеке у носилок.' },
        { yaw: -1.134, pitch: -0.297, title: 'Бордовая сумка', text: 'Переносная бордовая сумка стоит на открытой полке для быстрого доступа. Лекарственные препараты и медицинские изделия бригада хранит в укладках и наборах, состав которых утверждает Минздрав России. Какая укладка в этой сумке, будет указано после подтверждения станцией.' },
        { yaw: -0.977, pitch: -0.183, title: 'Чёрная сумка', text: 'Чёрная сумка с оранжевой молнией лежит на бордовой. Лекарственные препараты и медицинские изделия бригада хранит в укладках и наборах, состав которых утверждает Минздрав России. Какая укладка в этой сумке, будет указано после подтверждения станцией.' },
        { yaw: -1.77, pitch: -0.39, title: 'Укладка на нижней полке', text: 'Крупная мягкая укладка закреплена в нижней зоне стеллажа.' },
        { yaw: 0.37, pitch: -1.05, title: 'Жёсткий ящик у боковой двери', text: 'Жёсткий защитный ящик размещён на полу у боковой двери медицинского салона.' },
        { yaw: -2.77, pitch: 0.62, title: 'Иммобилизационное оснащение', text: 'Используется для ограничения движения повреждённой области при переноске и транспортировке пациента.' },
        { yaw: 0.35, pitch: 0.53, title: 'Панель управления отопителем', text: 'Блок управления с надписью «ОТОПИТЕЛЬ» и клавишные переключатели оборудования медицинского салона.' },
        { yaw: -1.35, pitch: 0.89, title: 'Аварийный люк', text: 'Люк в крыше с надписью «ЗАПАСНЫЙ ВЫХОД» — дополнительный путь эвакуации из медицинского салона.' },
        { yaw: -1.3, pitch: 0.47, title: 'Аварийный молоток', text: 'Закреплён над рабочим местом. Им разбивают стекло, если выйти из салона через двери невозможно.' },
        { yaw: -1.06, pitch: 0.18, title: 'Электрические розетки', text: 'Розетки 220 В и 12 В на панели рабочего места — для питания медицинского оборудования.' },
        { yaw: -0.4, pitch: -0.7, title: 'Огнетушитель', text: 'Закреплён у кресла медицинского салона. Место отмечено знаком на стене.' },
        { yaw: -2.13, pitch: -0.02, title: 'Кресло для переноски пациента', text: 'Складное кресло закреплено на внутренней стороне задней двери.' },
        { yaw: -2.42, pitch: -0.03, title: 'Задние двери', text: 'Выйти через задние двери к внешнему осмотру автомобиля класса B.', next: 'b-exterior', action: 'Выйти через задние двери' },
        { yaw: 1.96, pitch: -0.27, title: 'Боковая дверь', text: 'Выйти через боковую дверь во двор станции.', next: 'b-yard', action: 'Выйти через боковую дверь' }
      ]
    },
    'c-yard': {
      vehicle: 'c', view: 'yard',
      title: 'Двор станции',
      image: '/assets/tour-c-yard.jpg',
      yaw: -1.45,
      pitch: 0.02,
      hotspots: [
        { yaw: 0.24, pitch: 0.27, title: 'Здание станции', text: 'Здание Республиканской станции скорой медицинской помощи в Грозном.' },
        { yaw: -1.4, pitch: -0.14, title: 'Реанимобиль класса C', text: 'Автомобиль для работы специализированной бригады. Марка, модель и комплектация будут указаны после подтверждения станцией.' },
        { yaw: -1.2, pitch: 0.01, title: 'Кабина водителя', text: 'В кабине расположены органы управления автомобилем и средствами связи.' },
        { yaw: -1.83, pitch: -0.2, title: 'Ступень бокового входа', text: 'Ступень у бокового входа облегчает вход в медицинский салон и выход из него.' },
        { yaw: -2.22, pitch: 0.0, title: 'Задние двери', text: 'Обойти автомобиль и подойти к задним дверям медицинского салона.', next: 'c-exterior', action: 'Обойти к задним дверям' },
        { yaw: -1.83, pitch: 0.05, title: 'Боковая дверь медицинского салона', text: 'Войти в медицинский салон через боковую дверь.', next: 'c-interior', action: 'Войти в салон' }
      ]
    },
    'c-exterior': {
      vehicle: 'c', view: 'exterior',
      title: 'Реанимобиль класса C · сзади',
      image: '/assets/tour-c-exterior.jpg',
      yaw: -1.5,
      pitch: 0.02,
      hotspots: [
        { yaw: -1.6, pitch: 0.12, title: 'Медицинский салон', text: 'Войти в медицинский салон через задние двери.', next: 'c-interior', action: 'Войти в салон' },
        { yaw: -1.32, pitch: 0.67, title: 'Светозвуковая сигнализация', text: 'На крыше расположены элементы светозвуковой сигнализации автомобиля скорой медицинской помощи.' },
        { yaw: -1.59, pitch: -0.27, title: 'Зона размещения носилок', text: 'Задний вход ведёт к системе установки и фиксации носилок.' },
        { yaw: -1.9, pitch: 0.23, title: 'Кислородный баллон', text: 'В шкафу у задних дверей стоит баллон голубого цвета — так маркируют баллоны с медицинским кислородом. Сверху видны вентиль баллона и редуктор с манометром, от редуктора отходит шланг. Манометр показывает давление в баллоне, редуктор понижает его до рабочего. Объём баллона и модель редуктора будут указаны после подтверждения станцией.' },
        { yaw: -2.18, pitch: 0.39, title: 'Кресло для переноски пациента', text: 'Складное кресло закреплено на внутренней стороне задней двери.' },
        { yaw: -0.7, pitch: 0.12, title: 'Задняя дверь медицинского салона', text: 'Распашные створки открывают доступ к зоне размещения и фиксации носилок.' },
        { yaw: -0.96, pitch: -0.52, title: 'Двор станции', text: 'Обойти автомобиль справа и вернуться во двор станции, к боковой двери.', next: 'c-yard', action: 'Вернуться во двор' }
      ]
    },
    'c-interior': {
      vehicle: 'c', view: 'interior',
      title: 'Реанимобиль класса C · медицинский салон',
      image: '/assets/tour-c-interior.jpg',
      yaw: -1.3,
      pitch: -0.08,
      hotspots: [
        { yaw: -1.21, pitch: -0.24, title: 'Монитор-дефибриллятор', text: 'Комплекс для мониторинга показателей пациента и проведения предусмотренных моделью лечебных мероприятий. Модель будет указана после подтверждения станцией.' },
        { yaw: -1.35, pitch: -0.05, title: 'Аппарат искусственной вентиляции лёгких', text: 'Предназначен для респираторной поддержки пациента. Режимы работы зависят от конкретной модели.' },
        { yaw: -1.53, pitch: 0.07, title: 'Инфузионное оборудование', text: 'Оборудование для контролируемого введения растворов. Состав оборудования будет указан после подтверждения станцией.' },
        { yaw: -1.24, pitch: 0.16, title: 'Кислородная система', text: 'Стационарные крепления, редукторы и точки подключения обеспечивают использование кислородного оборудования.' },
        { yaw: -1.96, pitch: -0.51, title: 'Система носилок', text: 'Обеспечивает перемещение пациента и надёжное крепление во время транспортировки.' },
        { yaw: -1.89, pitch: -0.16, title: 'Реанимационная сумка', text: 'Переносная укладка с оборудованием и материалами для оказания помощи вне автомобиля.' },
        { yaw: -1.8, pitch: 0.07, title: 'Медицинская укладка на верхней полке', text: 'Переносная укладка хранится в верхней зоне стеллажа.' },
        { yaw: -1.69, pitch: -0.2, title: 'Кейс с маркировкой LUCAS', text: 'Транспортировочный кейс с маркировкой LUCAS. Описание устройства будет добавлено после подтверждения станцией.' },
        { yaw: -1.78, pitch: -0.39, title: 'Укладка на нижней полке', text: 'Крупная мягкая укладка размещена в нижней зоне стеллажа.' },
        { yaw: -0.58, pitch: -0.14, title: 'Дополнительная медицинская сумка', text: 'Отдельная переносная сумка размещена за креслом медицинского салона.' },
        { yaw: 0.47, pitch: -1.05, title: 'Жёсткий ящик у боковой двери', text: 'Жёсткий защитный ящик с маркировкой «44-2» размещён на полу у боковой двери.' },
        { yaw: -1.47, pitch: -0.48, title: 'Аспиратор', text: 'Предназначен для удаления жидкостей из дыхательных путей. Модель будет указана после подтверждения станцией.' },
        { yaw: -1.18, pitch: -0.65, title: 'Сейф', text: 'Металлический сейф в нижнем отсеке, частично закрыт носилками.' },
        { yaw: -2.85, pitch: 0.62, title: 'Иммобилизационное оснащение', text: 'Используется для ограничения движения повреждённой области при переноске и транспортировке пациента.' },
        { yaw: 0.42, pitch: 0.53, title: 'Панель управления отопителем', text: 'Блок управления с надписью «ОТОПИТЕЛЬ» и клавишные переключатели оборудования медицинского салона.' },
        { yaw: -1.39, pitch: 0.92, title: 'Аварийный люк', text: 'Люк в крыше с надписью «ЗАПАСНЫЙ ВЫХОД» — дополнительный путь эвакуации из медицинского салона.' },
        { yaw: -1.32, pitch: 0.48, title: 'Аварийный молоток', text: 'Закреплён над рабочим местом. Им разбивают стекло, если выйти из салона через двери невозможно.' },
        { yaw: -1.07, pitch: 0.17, title: 'Электрические розетки', text: 'Розетки 220 В и 12 В на панели рабочего места — для питания медицинского оборудования.' },
        { yaw: -0.4, pitch: -0.7, title: 'Огнетушитель', text: 'Закреплён у кресла медицинского салона. Место отмечено знаком на стене.' },
        { yaw: -2.14, pitch: -0.03, title: 'Кресло для переноски пациента', text: 'Складное кресло закреплено на внутренней стороне задней двери.' },
        { yaw: -2.45, pitch: -0.05, title: 'Задние двери', text: 'Выйти через задние двери к внешнему осмотру реанимобиля класса C.', next: 'c-exterior', action: 'Выйти через задние двери' },
        { yaw: 1.96, pitch: -0.27, title: 'Боковая дверь', text: 'Выйти через боковую дверь во двор станции.', next: 'c-yard', action: 'Выйти через боковую дверь' }
      ]
    }
  };
  // Demonstration panoramas (tour-exterior-demo.jpg, tour-interior-demo.jpg) are shown
  // in the demo mode only, with their own points; they are not shots of the station.
  const demoScenes = {
    exterior: {
      title: 'Демонстрационная панорама · снаружи',
      yaw: 0,
      pitch: -0.03,
      hotspots: [
        { yaw: 0.08, pitch: -0.02, title: 'Автомобиль скорой помощи', text: 'Демонстрационная панорама показывает возможности тура. Модели и комплектация автомобилей классов B и C будут указаны после съёмки автомобилей станции.', next: 'demo-interior', action: 'Перейти в салон' },
        { yaw: -0.92, pitch: 0.03, title: 'Светозвуковая сигнализация', text: 'Специальные световые и звуковые сигналы применяются при выполнении экстренного вызова в установленном порядке.' },
        { yaw: 0.84, pitch: 0.01, title: 'Доступ в медицинский салон', text: 'Двери и ступень обеспечивают доступ бригады к медицинскому салону и перемещение пациента.' },
        { yaw: 1.48, pitch: -0.04, title: 'Внешние отсеки', text: 'В зависимости от модели автомобиля в защищённых отсеках может размещаться часть переносного оснащения.' }
      ]
    },
    interior: {
      title: 'Демонстрационная панорама · салон',
      yaw: 0,
      pitch: -0.02,
      hotspots: [
        { yaw: 0.04, pitch: 0.02, title: 'Монитор пациента', text: 'Применяется для наблюдения за показателями пациента. Название модели и доступные режимы будут указаны по паспорту оборудования станции.' },
        { yaw: -0.72, pitch: -0.17, title: 'Система носилок', text: 'Предназначена для перемещения пациента и фиксации носилок в медицинском салоне.' },
        { yaw: 1.04, pitch: 0.04, title: 'Кислородная система', text: 'Обеспечивает размещение и подключение кислородного оборудования. Точный состав зависит от комплектации автомобиля.' },
        { yaw: -1.25, pitch: 0.06, title: 'Сумка экстренной помощи', text: 'Переносная медицинская укладка позволяет доставить необходимые средства непосредственно к пациенту.' },
        { yaw: 1.72, pitch: -0.08, title: 'Иммобилизационное оснащение', text: 'Используется для ограничения движения повреждённой области при переноске и транспортировке пациента.' },
        { yaw: -2.02, pitch: 0.08, title: 'Аспиратор', text: 'Медицинский аспиратор применяется для удаления жидкостей из дыхательных путей. Конкретная модель требует подтверждения станции.' },
        { yaw: 2.38, pitch: 0.02, title: 'Выход наружу', text: 'Вернуться к внешнему осмотру автомобиля.', next: 'demo-exterior', action: 'Выйти наружу' }
      ]
    }
  };

  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const datasetKey = (prefix, name) => prefix + name.replace(/(?:^|-)(\w)/g, (match, letter) => letter.toUpperCase());

  // Panorama files, previews and tiles come from the page (TOUR_PANORAMAS in
  // build_pages.py); the paths in `scenes` above are defaults for older markup.
  for (const name of Object.keys(scenes)) {
    const image = root.dataset[datasetKey('panorama', name)];
    if (image) scenes[name].image = image;
    scenes[name].preview = root.dataset[datasetKey('preview', name)] || null;
    try { scenes[name].tiles = JSON.parse(root.dataset[datasetKey('tiles', name)] || 'null'); } catch { scenes[name].tiles = null; }
  }
  // While classes B and C share the same demonstration panoramas, the page shows
  // one demonstration tour without a class choice. With separate shots of both
  // vehicles the B/C selector is used; the station yard is a scene when the page
  // has its tab. The build sets the mode (build_pages.py, TOUR_PANORAMAS).
  const separateVehicles = ['exterior', 'interior'].every(view => scenes[`b-${view}`].image !== scenes[`c-${view}`].image);
  const mode = ['demo', 'vehicles'].includes(root.dataset.tourMode) ? root.dataset.tourMode : (separateVehicles ? 'vehicles' : 'demo');
  // Views in the order of the scene tabs: the yard is shown only when the page has its tab.
  const pageViews = [...root.querySelectorAll('[data-view]')].map(tab => tab.dataset.view);
  const views = pageViews.length ? pageViews : ['exterior', 'interior'];
  if (mode === 'demo') {
    vehicles.demo = { title: 'Демонстрационный тур', short: 'Демо' };
    // The demonstration files come from the page as the b-* panoramas.
    for (const view of ['exterior', 'interior']) {
      const { image, preview, tiles } = scenes[`b-${view}`];
      scenes[`demo-${view}`] = { ...demoScenes[view], vehicle: 'demo', view, image, preview, tiles };
    }
    document.querySelector('.tour-vehicle-selector')?.setAttribute('hidden', '');
  }
  const inTour = scene => views.includes(scene.view) && (mode === 'demo' ? scene.vehicle === 'demo' : scene.vehicle !== 'demo');
  const tourNames = new Set(Object.keys(scenes).filter(name => inTour(scenes[name])));
  const tourScenes = [...tourNames].map(name => scenes[name]);
  // A door to a scene outside this tour is not shown.
  for (const scene of tourScenes) scene.hotspots = scene.hotspots.filter(spot => !spot.next || tourNames.has(spot.next));
  // Links shared earlier (#b-interior, #c-exterior …) open the same view in the current mode.
  function sceneFromHash(hash) {
    const match = /^(b|c|demo)-(yard|exterior|interior)$/.exec(hash);
    if (!match) return null;
    const name = mode === 'demo' ? `demo-${match[2]}` : match[1] === 'demo' ? `b-${match[2]}` : hash;
    return tourNames.has(name) ? name : null;
  }
  const defaultScene = mode === 'demo' ? 'demo-exterior' : `b-${views[0]}`;

  // Numbers in the page introduction follow the scene data.
  const plural = (n, forms) => forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2];
  const stats = {
    scenes: [tourScenes.length, ['панорама', 'панорамы', 'панорам'], ' 360°'],
    points: [tourScenes.reduce((sum, scene) => sum + scene.hotspots.length, 0), ['интерактивная точка', 'интерактивные точки', 'интерактивных точек'], '']
  };
  for (const [key, [count, forms, suffix]] of Object.entries(stats)) {
    const value = document.querySelector(`[data-stat="${key}"]`), label = document.querySelector(`[data-stat-label="${key}"]`);
    if (value) value.textContent = String(count);
    if (label) label.textContent = plural(count, forms) + suffix;
  }
  // Tiles are used only when every scene has them: the engine works in one mode.
  const tilesMode = tourScenes.every(scene => scene.tiles && scene.tiles.base && Array.isArray(scene.tiles.levels) && scene.tiles.levels.length > 0);

  // Angles are kept in radians; the engine counts the field of view in degrees
  // and the zoom as 0–100 between the widest and the narrowest view.
  const TAU = Math.PI * 2;
  const DEFAULT_FOV = Math.PI / 2.25, MIN_FOV = 0.58, MAX_FOV = 1.72, MAX_PITCH = 1.28;
  const toDegrees = radians => radians * 180 / Math.PI;
  const toRadians = degrees => degrees * Math.PI / 180;
  const clampFov = value => Math.max(MIN_FOV, Math.min(MAX_FOV, value));
  const clampPitch = value => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, value));
  const zoomOf = fov => Math.max(0, Math.min(100, (MAX_FOV - clampFov(fov)) / (MAX_FOV - MIN_FOV) * 100));
  const fovOf = zoom => MAX_FOV + (MIN_FOV - MAX_FOV) * zoom / 100;
  const shortestArc = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery.matches || document.documentElement.classList.contains('no-motion');
  const isAbort = error => Boolean(PSV.utils?.isAbortError?.(error) || error?.name === 'AbortError');
  const state = { vehicle: scenes[defaultScene].vehicle, scene: defaultScene, dragging: false, auto: false, gyro: false, presence: false };

  // three.js inside the engine needs WebGL 2 (Chrome, Edge, Firefox, Safari 15+). The engine
  // itself does not throw without it, so the check comes first.
  const hasWebGL2 = (() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return Boolean(gl);
    } catch { return false; }
  })();
  if (!hasWebGL2) {
    stage.hidden = true;
    showFallback('Не удалось запустить 3D-графику.', 'Откройте страницу в современной версии Chrome, Safari, Firefox или Edge. Список оборудования остаётся доступен ниже.');
    const requested = parseHash(location.hash.slice(1));
    const scene = scenes[requested ? requested.scene : defaultScene];
    const list = document.querySelector('[data-hotspot-list]');
    const title = root.querySelector('[data-scene-name]');
    if (title) title.textContent = scene.title;
    if (list) {
      list.replaceChildren();
      for (const spot of scene.hotspots) {
        const item = document.createElement('li');
        if (spot.next) item.className = 'is-transition';
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        const text = document.createElement('p');
        summary.textContent = spot.next ? `${spot.title} · ${spot.action}` : spot.title;
        text.textContent = spot.text;
        details.append(summary, text);
        item.append(details);
        list.append(item);
      }
    }
    return;
  }
  let viewer = null;
  try {
    const config = {
      container: stage,
      navbar: false,
      loadingImg: null,
      loadingTxt: '',
      minFov: toDegrees(MIN_FOV),
      maxFov: toDegrees(MAX_FOV),
      defaultZoomLvl: zoomOf(DEFAULT_FOV),
      // Прямое управление: перетаскивание мышью или одним пальцем вращает
      // панораму, обычное колесо меняет масштаб.
      mousewheel: true,
      mousewheelCtrlKey: false,
      touchmoveTwoFingers: false,
      keyboard: false,
      moveInertia: !reducedMotion(),
      canvasBackground: '#040d0a',
      lang: { loading: 'Загрузка…', loadError: 'Не удалось загрузить панораму', webglError: 'Не удалось запустить 3D-графику', twoFingers: 'Перемещайте панораму двумя пальцами', ctrlZoom: 'Масштаб — Ctrl и колесо мыши' }
    };
    // Tiles: the small preview appears at once, then only the visible parts load at the needed detail.
    if (tilesMode) config.adapter = [PSV.EquirectangularTilesAdapter, { showErrorTile: false, baseBlur: true }];
    viewer = new PSV.Viewer(config);
  } catch {
    stage.hidden = true;
    showFallback('Не удалось запустить 3D-графику.', 'Откройте страницу в современной версии Chrome, Safari, Firefox или Edge.');
    return;
  }
  const engineCanvas = stage.querySelector('canvas');
  engineCanvas?.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    showFallback('3D-графика временно остановлена.', 'Обновите страницу, чтобы восстановить панорамный тур.');
  });
  engineCanvas?.addEventListener('webglcontextrestored', () => location.reload());
  if ('ResizeObserver' in window) new ResizeObserver(() => viewer.autoSize()).observe(root);
  const currentView = () => {
    const position = viewer.getPosition();
    return { yaw: position.yaw, pitch: position.pitch, fov: fovOf(viewer.getZoomLevel()) };
  };

  // Scripted camera moves (a point, a door, the opening reveal) use the engine's
  // animation; any drag or wheel stops it. The promise tells whether it arrived.
  let flight = null, gyroYawOffset = null;
  function flyTo(target, done = null, { duration = 0 } = {}) {
    const from = currentView();
    const to = { yaw: target.yaw, pitch: clampPitch(target.pitch), fov: clampFov(target.fov ?? Math.min(from.fov, DEFAULT_FOV)) };
    if (state.gyro) gyroYawOffset = null;
    if (reducedMotion() || document.hidden || state.gyro) {
      viewer.rotate({ yaw: to.yaw, pitch: to.pitch });
      viewer.zoom(zoomOf(to.fov));
      done?.();
      return Promise.resolve(true);
    }
    const distance = Math.hypot(shortestArc(from.yaw, to.yaw), to.pitch - from.pitch, (to.fov - from.fov) * 2);
    const animation = viewer.animate({ yaw: to.yaw, pitch: to.pitch, zoom: zoomOf(to.fov), speed: duration || Math.min(1100, 400 + distance * 320) });
    if (!animation) { done?.(); return Promise.resolve(true); }
    flight = animation;
    return Promise.resolve(animation).then(completed => {
      if (flight === animation) flight = null;
      if (completed) done?.();
      return completed;
    });
  }
  // Where to aim at a point so that the description card does not cover it:
  // left of centre on wide screens (card on the right), above centre on phones (card at the bottom):
  // in the middle of the free area between the top row of buttons and the card.
  const narrowLayout = matchMedia('(max-width: 800px)');
  const TOP_BAR = 60;
  function cardTop() {
    return infoCard.hidden ? 0 : infoCard.offsetTop;
  }
  function framing(spot) {
    const fov = Math.min(currentView().fov, DEFAULT_FOV), t = Math.tan(fov / 2), aspect = root.clientWidth / Math.max(1, root.clientHeight);
    if (narrowLayout.matches) {
      const half = root.clientHeight / 2, top = cardTop();
      const shift = top > TOP_BAR + 40 ? Math.min(0.7, (half - (TOP_BAR + top) / 2) / half) : 0.42;
      return { yaw: spot.yaw, pitch: spot.pitch - Math.atan(shift * t), fov };
    }
    return { yaw: spot.yaw + Math.atan(0.3 * t * aspect), pitch: spot.pitch, fov };
  }

  // Hotspots. Buttons are always paired with the scene they were built for,
  // so a scene switch can never read hotspots of another scene.
  const hotspotsLayer = root.querySelector('[data-hotspots]');
  const hotspotList = document.querySelector('[data-hotspot-list]');
  const infoCard = root.querySelector('[data-tour-card]');
  const infoTitle = infoCard.querySelector('[data-card-title]');
  const infoText = infoCard.querySelector('[data-card-text]');
  const infoAction = infoCard.querySelector('[data-card-action]');
  const infoIndex = infoCard.querySelector('[data-card-index]');
  const prevButton = infoCard.querySelector('[data-card-prev]');
  const nextButton = infoCard.querySelector('[data-card-next]');
  const guideTimer = infoCard.querySelector('.tour-guide-timer');
  const speakButton = infoCard.querySelector('[data-card-speak]');
  const moreButton = root.querySelector('[data-more]');
  const moreMenu = root.querySelector('[data-more-menu]');
  const moreControls = moreMenu ? [...moreMenu.querySelectorAll('button[aria-pressed]')] : [];
  const scenesButton = root.querySelector('[data-scenes-toggle]');
  const scenesCurrent = root.querySelector('[data-scenes-current]');
  const scenesMenu = root.querySelector('.tour-scene-tabs');
  const backButton = root.querySelector('[data-back]');
  const backLabel = backButton?.querySelector('[data-back-label]');
  const compactScenes = matchMedia('(max-width: 800px), (max-height: 520px) and (pointer: coarse)');
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  if (speakButton) speakButton.hidden = !canSpeak;
  let activeHotspot = null, cardOpener = null, placedHotspots = [];
  const infoSpots = scene => scene.hotspots.filter(spot => !spot.next);
  // A transition point shows only its sign. The first tap shows the action («Перейти в салон»),
  // the second tap (on the sign or on the action) moves to the scene. With a mouse the action
  // shows on hover and with the keyboard on focus, so one click or Enter is enough there.
  const hoverPointer = matchMedia('(hover: hover) and (pointer: fine)');
  let armedHotspot = null, armTimer = 0;
  const actionShown = button => button.classList.contains('is-armed') || button.matches(':focus-visible') || (hoverPointer.matches && button.matches(':hover'));
  function disarm() {
    clearTimeout(armTimer);
    armedHotspot?.classList.remove('is-armed');
    armedHotspot = null;
  }
  function arm(button, spot) {
    disarm();
    armedHotspot = button;
    button.classList.add('is-armed');
    armTimer = setTimeout(disarm, 6000);
    announce(`${spot.action}. Нажмите ещё раз, чтобы перейти.`);
    haptic(10);
    playSound('arm');
  }
  document.addEventListener('pointerdown', event => {
    if (armedHotspot && !armedHotspot.contains(event.target)) disarm();
  }, true);

  function syncMoreButton() {
    if (!moreButton) return;
    const hasActive = moreControls.some(button => !button.hidden && button.getAttribute('aria-pressed') === 'true');
    moreButton.classList.toggle('has-active', hasActive);
    moreButton.setAttribute('aria-label', hasActive ? 'Дополнительные функции, есть активные' : 'Дополнительные функции');
  }
  function setMoreOpen(open, restoreFocus = false) {
    if (!moreButton || !moreMenu) return;
    moreMenu.hidden = !open;
    moreButton.setAttribute('aria-expanded', String(open));
    if (!open && restoreFocus) moreButton.focus({ preventScroll: true });
  }
  function syncScenesButton(scene = scenes[state.scene]) {
    if (!scenesButton || !scene) return;
    const labels = { yard: 'Двор станции', exterior: scene.vehicle === 'demo' ? 'Снаружи' : 'Сзади', interior: 'Салон' };
    const label = labels[scene.view] || scene.title;
    if (scenesCurrent) scenesCurrent.textContent = label;
    scenesButton.setAttribute('aria-label', `Выбрать сцену. Текущая сцена: ${label}`);
  }
  // «Назад» leads one step out. From the cabin — back where the visitor came in (the yard through
  // the side door or the rear doors); opened by a link — to the rear doors. From the rear doors — to the yard.
  const BACK_LABELS = {
    yard: ['Во двор', 'Вернуться во двор станции'],
    exterior: ['Наружу', 'Выйти наружу']
  };
  let backScene = null, cabinEntrance = null;
  function syncBackButton(scene = scenes[state.scene]) {
    if (!backButton || !scene) return;
    const prefix = state.scene.split('-')[0];
    let name = null;
    if (scene.view === 'interior') name = cabinEntrance && tourNames.has(cabinEntrance) ? cabinEntrance : `${prefix}-exterior`;
    else if (scene.view === 'exterior') name = `${prefix}-yard`;
    // Only scenes of this tour: without yard panoramas there is no way back to the yard.
    backScene = name && tourNames.has(name) ? name : null;
    backButton.hidden = !backScene;
    root.classList.toggle('has-back', Boolean(backScene));
    if (!backScene) return;
    const view = scenes[backScene].view;
    const [label, aria] = view === 'exterior' && scenes[backScene].vehicle !== 'demo' ? ['Сзади', 'Выйти к задним дверям'] : BACK_LABELS[view];
    if (backLabel) backLabel.textContent = label;
    backButton.setAttribute('aria-label', aria);
  }
  backButton?.addEventListener('click', () => {
    if (!backScene) return;
    stopGuide();
    goToScene(backScene);
  });
  function setScenesOpen(open, restoreFocus = false) {
    if (!scenesButton || !scenesMenu) return;
    const expanded = Boolean(open && compactScenes.matches);
    scenesMenu.classList.toggle('is-open', expanded);
    scenesButton.setAttribute('aria-expanded', String(expanded));
    if (!expanded && restoreFocus) scenesButton.focus({ preventScroll: true });
  }
  moreButton?.addEventListener('click', () => {
    setScenesOpen(false);
    setMoreOpen(moreMenu.hidden);
  });
  scenesButton?.addEventListener('click', () => {
    setMoreOpen(false);
    setScenesOpen(scenesButton.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('pointerdown', event => {
    if (!moreMenu?.hidden && !root.querySelector('.tour-controls')?.contains(event.target)) setMoreOpen(false);
    if (scenesButton?.getAttribute('aria-expanded') === 'true' && !scenesButton.contains(event.target) && !scenesMenu?.contains(event.target)) setScenesOpen(false);
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !moreMenu?.hidden) {
      event.preventDefault();
      setMoreOpen(false, true);
    } else if (event.key === 'Escape' && scenesButton?.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setScenesOpen(false, true);
    }
  });
  compactScenes.addEventListener?.('change', () => setScenesOpen(false));
  if (moreControls.length && 'MutationObserver' in window) {
    new MutationObserver(syncMoreButton).observe(moreMenu, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'hidden'] });
  }
  syncMoreButton();
  syncScenesButton();

  function chevron() {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
    for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', 'aria-hidden': 'true' })) svg.setAttribute(name, value);
    for (const [name, value] of Object.entries({ d: 'M9 6l6 6-6 6', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) path.setAttribute(name, value);
    svg.append(path);
    return svg;
  }
  function clearHotspots() {
    disarm();
    placedHotspots = [];
    hotspotsLayer.replaceChildren();
    hotspotList?.replaceChildren();
  }
  function buildHotspots(scene) {
    clearHotspots();
    let number = 0;
    scene.hotspots.forEach((spot, order) => {
      const button = document.createElement('button');
      button.className = spot.next ? 'tour-hotspot is-transition' : 'tour-hotspot';
      button.type = 'button';
      button.hidden = true;
      button.setAttribute('aria-label', spot.title);
      button.style.setProperty('--order', String(order));
      const mark = document.createElement('span');
      mark.setAttribute('aria-hidden', 'true');
      if (spot.next) mark.append(chevron()); else mark.textContent = String(++number);
      const label = document.createElement('b');
      label.textContent = spot.title;
      button.append(mark, label);
      if (spot.next) {
        const action = document.createElement('small');
        action.textContent = spot.action;
        button.append(action);
      }
      button.addEventListener('click', () => {
        stopGuide();
        if (!spot.next) {
          disarm();
          openHotspot(spot, button);
          keepInView(spot);
        } else if (actionShown(button)) {
          disarm();
          goToScene(spot.next, spot);
        } else arm(button, spot);
      });
      hotspotsLayer.append(button);
      placedHotspots.push({ spot, button });
      if (hotspotList) {
        const item = document.createElement('li');
        if (spot.next) item.className = 'is-transition';
        const listButton = document.createElement('button');
        listButton.type = 'button';
        listButton.textContent = spot.next ? spot.action : spot.title;
        listButton.addEventListener('click', () => {
          stopGuide();
          root.scrollIntoView({ block: 'nearest' });
          if (spot.next) goToScene(spot.next, spot);
          else {
            openHotspot(spot, listButton);
            flyTo(framing(spot));
          }
        });
        item.append(listButton);
        hotspotList.append(item);
      }
    });
  }
  // Marks follow the picture: the engine reports every redraw.
  function updateHotspots() {
    if (!placedHotspots.length) return;
    const w = root.clientWidth, h = root.clientHeight;
    for (const { spot, button } of placedHotspots) {
      const position = { yaw: spot.yaw, pitch: spot.pitch };
      let point = null;
      if (viewer.dataHelper.isPointVisible(position)) {
        point = viewer.dataHelper.sphericalCoordsToViewerCoords(position);
        if (point.x < -0.075 * w || point.x > 1.075 * w || point.y < -0.075 * h || point.y > 1.075 * h) point = null;
        // Phones: a point under the top row of buttons waits until the panorama is turned.
        else if (compactScenes.matches && point.y < TOP_BAR - 4) point = null;
      }
      button.hidden = !point;
      if (!point) continue;
      button.style.transform = `translate(-50%,-50%) translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`;
      button.classList.toggle('is-flipped', point.x > w * 0.58);
    }
  }
  // Phones: a tapped point that ends up under the description card is brought above it.
  function keepInView(spot) {
    if (!narrowLayout.matches || infoCard.hidden) return;
    const point = viewer.dataHelper.sphericalCoordsToViewerCoords({ yaw: spot.yaw, pitch: spot.pitch });
    if (point.y > cardTop() - 24 || point.y < TOP_BAR) flyTo(framing(spot));
  }
  viewer.addEventListener('render', updateHotspots);
  function markActive() {
    for (const { spot, button } of placedHotspots) button.classList.toggle('is-active', spot === activeHotspot);
  }
  function stopSpeech() { if (canSpeak) speechSynthesis.cancel(); }
  function openHotspot(spot, opener, { focus = true } = {}) {
    activeHotspot = spot;
    cardOpener = opener || null;
    const info = infoSpots(scenes[state.scene]), index = info.indexOf(spot), canStep = !spot.next && info.length > 1;
    if (infoIndex) infoIndex.textContent = spot.next ? 'Переход' : `Точка ${index + 1} из ${info.length}`;
    if (prevButton) prevButton.hidden = !canStep;
    if (nextButton) nextButton.hidden = !canStep;
    infoTitle.textContent = spot.title;
    infoText.textContent = spot.text;
    infoAction.hidden = !spot.next;
    infoAction.textContent = spot.action || 'Перейти';
    stopSpeech();
    infoCard.hidden = false;
    if (focus) infoCard.focus({ preventScroll: true });
    markActive();
    haptic(20);
    playSound('point');
  }
  function closeCard(restoreFocus = true) {
    if (infoCard.hidden) return;
    stopSpeech();
    infoCard.hidden = true;
    activeHotspot = null;
    markActive();
    if (!restoreFocus) return;
    const target = cardOpener && cardOpener.isConnected && !cardOpener.hidden ? cardOpener : root;
    target.focus({ preventScroll: true });
  }
  function stepHotspot(delta) {
    const info = infoSpots(scenes[state.scene]), index = info.indexOf(activeHotspot);
    if (index < 0 || info.length < 2) return;
    if (guide && delta > 0) { guideNext(); return; }
    stopGuide();
    const spot = info[(index + delta + info.length) % info.length];
    openHotspot(spot, cardOpener, { focus: false });
    flyTo(framing(spot));
  }
  prevButton?.addEventListener('click', () => stepHotspot(-1));
  nextButton?.addEventListener('click', () => stepHotspot(1));
  infoAction.addEventListener('click', () => {
    const spot = activeHotspot;
    if (!spot?.next) return;
    if (guide) {
      clearTimeout(guide.timer);
      guide.visited.add(spot.next);
      guide.pendingScene = spot.next;
    }
    goToScene(spot.next, spot);
    root.focus({ preventScroll: true });
  });
  infoCard.querySelector('[data-card-close]').addEventListener('click', () => { stopGuide(); closeCard(); });
  speakButton?.addEventListener('click', () => {
    if (!canSpeak || !activeHotspot) return;
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(`${activeHotspot.title}. ${activeHotspot.text}`);
    utterance.lang = 'ru-RU';
    speechSynthesis.speak(utterance);
  });

  // Tabs: vehicle and view selectors follow the ARIA tabs pattern.
  const vehicleTabs = [...document.querySelectorAll('[data-vehicle]')];
  const viewTabs = [...root.querySelectorAll('[data-view]')];
  if (!root.id) root.id = 'tour-viewport';
  function syncTabs(tabs, isSelected) {
    tabs.forEach(tab => {
      const selected = isSelected(tab);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (!tab.hasAttribute('aria-controls')) tab.setAttribute('aria-controls', root.id);
    });
  }
  function syncThumbs(vehicle) {
    for (const tab of viewTabs) {
      const thumb = tab.querySelector('[data-scene-thumb]'), scene = scenes[`${vehicle}-${tab.dataset.view}`];
      const src = scene && (scene.preview || scene.image);
      if (thumb && src && thumb.getAttribute('src') !== src) thumb.src = src;
    }
  }
  function tabKeys(tabs) {
    tabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
      const keys = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in keys)) return;
      event.preventDefault();
      event.stopPropagation();
      const next = tabs[(keys[event.key] + tabs.length) % tabs.length];
      next.focus();
      next.click();
    }));
  }
  tabKeys(vehicleTabs);
  tabKeys(viewTabs);

  // Scene loading. With tiles the engine shows the preview at once and then the
  // visible tiles; with single files the preview is replaced by the full panorama.
  // Afterwards the neighbouring scenes are fetched in advance.
  const vehicleTitle = document.querySelector('[data-current-vehicle]');
  const sceneName = root.querySelector('[data-scene-name]');
  const sceneIndex = root.querySelector('[data-scene-index]');
  const prefetched = new Map();
  let firstLoad = true, sceneLoadId = 0, slowTimer = 0;
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      const settle = () => (image.complete && image.naturalWidth ? resolve(image) : reject(new Error(url)));
      image.src = url;
      if (image.decode) image.decode().then(() => resolve(image), () => { if (image.complete) settle(); else image.onload = image.onerror = settle; });
      else image.onload = image.onerror = settle;
    });
  }
  function prefetch(url) {
    if (!url || prefetched.has(url)) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    prefetched.set(url, image);
  }
  const tileUrl = (tiles, level, col, row) => `${tiles.base}${level}/${col}_${row}.jpg`;
  function tilesPanorama(scene) {
    const tiles = scene.tiles;
    return { baseUrl: scene.preview || undefined, levels: tiles.levels, tileUrl: (col, row, level) => tileUrl(tiles, level, col, row) };
  }
  function prefetchScenePreviews(current) {
    for (const scene of tourScenes) {
      if (scene === current) continue;
      prefetch(scene.preview);
    }
  }
  async function loadFullImage(scene, loadId) {
    const timer = setTimeout(() => { if (loadId === sceneLoadId) root.classList.add('is-sharpening'); }, 500);
    try {
      // Decoded in the background first, so the swap itself is instant. No position
      // is passed: the engine keeps the current view and any running camera move.
      await loadImage(scene.image);
      if (loadId !== sceneLoadId) return;
      const loaded = await viewer.setPanorama(scene.image, { transition: false, showLoader: false });
      if (loaded && loadId === sceneLoadId) prefetchScenePreviews(scene);
    } catch (error) {
      if (loadId !== sceneLoadId || isAbort(error)) return;
      viewer.hideError();
      setStatus('Панорама показана в сниженном качестве: полный файл не загрузился.');
    } finally {
      clearTimeout(timer);
      if (loadId === sceneLoadId) root.classList.remove('is-sharpening');
    }
  }
  async function loadScene(name, fromUser = false, view = null) {
    if (!own(scenes, name)) return;
    root.classList.remove('is-approaching');
    const scene = scenes[name], loadId = ++sceneLoadId, intro = firstLoad;
    const walking = root.classList.contains('is-switching');
    const target = view || { yaw: scene.yaw, pitch: scene.pitch, fov: DEFAULT_FOV };
    // The cabin remembers the door the visitor came in through, so «Назад» returns there.
    // Opened by a link (not by the visitor's move), the cabin has no entrance.
    if (scene.view === 'interior') {
      const from = scenes[state.scene];
      cabinEntrance = fromUser && from && state.scene !== name && from.vehicle === scene.vehicle && from.view !== 'interior' ? state.scene : null;
    }
    state.scene = name; state.vehicle = scene.vehicle;
    setSoundScene(scene.view);
    if (state.gyro) gyroYawOffset = null;
    closeCard(false);
    clearHotspots();
    fallback.hidden = true;
    root.classList.remove('is-sharpening');
    clearTimeout(slowTimer);
    // A quick switch shows only the engine's dip to black; the loading screen
    // appears if loading takes longer.
    const busy = () => {
      if (loadId !== sceneLoadId) return;
      root.classList.add('is-loading');
      root.setAttribute('aria-busy', 'true');
    };
    if (intro) busy(); else slowTimer = setTimeout(busy, 350);
    if (sceneName) sceneName.textContent = scene.title;
    syncScenesButton(scene);
    syncBackButton(scene);
    if (sceneIndex) sceneIndex.textContent = `${String(views.indexOf(scene.view) + 1).padStart(2, '0')} / ${String(views.length).padStart(2, '0')}`;
    syncTabs(viewTabs, tab => tab.dataset.view === scene.view);
    syncTabs(vehicleTabs, tab => tab.dataset.vehicle === scene.vehicle);
    syncThumbs(scene.vehicle);
    if (vehicleTitle) vehicleTitle.textContent = vehicles[scene.vehicle].title;
    history.replaceState(null, '', `#${name}`);
    const reveal = intro && !reducedMotion();
    let loaded = false;
    try {
      loaded = await viewer.setPanorama(tilesMode ? tilesPanorama(scene) : (scene.preview || scene.image), {
        position: { yaw: target.yaw, pitch: target.pitch },
        zoom: zoomOf(reveal ? clampFov(target.fov + 0.3) : target.fov),
        showLoader: false,
        transition: intro || reducedMotion() ? false : { speed: walking ? 180 : 450, effect: 'black', rotation: false }
      });
    } catch (error) {
      if (loadId !== sceneLoadId || isAbort(error)) return;
      clearTimeout(slowTimer);
      viewer.hideError();
      showFallback('Не удалось загрузить панораму.', 'Проверьте подключение к интернету и повторите попытку.', true);
      return;
    }
    if (!loaded || loadId !== sceneLoadId) return;
    clearTimeout(slowTimer);
    root.classList.remove('is-loading', 'is-switching');
    root.removeAttribute('aria-busy');
    buildHotspots(scene);
    updateHotspots();
    if (reveal) flyTo(target, null, { duration: 1200 });
    firstLoad = false;
    if (fromUser) announce(`${scene.title}. Активных точек: ${scene.hotspots.length}.`);
    if (guide && guide.pendingScene === name) continueGuide();
    if (!tilesMode && scene.preview && scene.preview !== scene.image) loadFullImage(scene, loadId);
    else prefetchScenePreviews(scene);
  }
  // Walking through a door: the camera moves towards it while the picture dims.
  function goToScene(name, via = null) {
    if (!own(scenes, name)) return;
    moveFeedback(state.scene, name);
    setMoreOpen(false);
    setScenesOpen(false);
    closeCard(false);
    if (via && fallback.hidden && !document.hidden && !state.gyro && !reducedMotion()) {
      root.classList.add('is-approaching');
      const token = sceneLoadId;
      const currentFov = currentView().fov;
      const approachFov = Math.max(MIN_FOV + 0.3, currentFov - 0.28);
      flyTo({ yaw: via.yaw, pitch: via.pitch, fov: approachFov }, null, { duration: 520 }).then(() => {
        root.classList.remove('is-approaching');
        // A tab chosen during the walk wins over the door.
        if (token === sceneLoadId) {
          root.classList.add('is-switching');
          loadScene(name, true);
        }
      });
    } else {
      loadScene(name, true);
    }
  }
  fallback.querySelector('[data-tour-retry]')?.addEventListener('click', () => loadScene(state.scene, true));
  viewTabs.forEach(button => button.addEventListener('click', () => {
    const name = `${state.vehicle}-${button.dataset.view}`;
    if (name === state.scene && fallback.hidden) return;
    stopGuide();
    setScenesOpen(false);
    moveFeedback(state.scene, name);
    loadScene(name, true);
  }));
  vehicleTabs.forEach(button => button.addEventListener('click', () => {
    const currentScene = scenes[state.scene]?.view || 'exterior';
    const name = `${button.dataset.vehicle}-${currentScene}`;
    if (name === state.scene && fallback.hidden) return;
    stopGuide();
    setScenesOpen(false);
    loadScene(name, true);
  }));

  // Links to a view: #scene or #scene@yaw,pitch,fov (degrees), made by the «share» button.
  function parseHash(raw) {
    const match = /^([a-z]+-[a-z]+)(?:@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,2}(?:\.\d+)?)(?:,(\d{1,3}(?:\.\d+)?))?)?$/.exec(raw);
    const scene = match && sceneFromHash(match[1]);
    if (!scene || !own(scenes, scene)) return null;
    const view = match[2] === undefined ? null : { yaw: toRadians(+match[2]), pitch: clampPitch(toRadians(+match[3])), fov: match[4] ? clampFov(toRadians(+match[4])) : DEFAULT_FOV };
    return { scene, view };
  }
  window.addEventListener('hashchange', () => {
    const target = parseHash(location.hash.slice(1));
    if (!target) return;
    if (target.scene !== state.scene || !fallback.hidden) { stopGuide(); loadScene(target.scene, true, target.view); }
    else if (target.view) { stopGuide(); flyTo(target.view); }
  });
  const shareButton = root.querySelector('[data-share]');
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'copy-buffer';
    root.append(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    area.remove();
    return copied;
  }
  shareButton?.addEventListener('click', async () => {
    const view = currentView(), yaw = Math.atan2(Math.sin(view.yaw), Math.cos(view.yaw));
    const url = `${location.origin}${location.pathname}#${state.scene}@${Math.round(toDegrees(yaw))},${Math.round(toDegrees(view.pitch))},${Math.round(toDegrees(view.fov))}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: document.title, url }); return; } catch (error) { if (error && error.name === 'AbortError') return; }
    }
    const copied = await copyText(url);
    shareButton.focus({ preventScroll: true });
    setStatus(copied ? 'Ссылка на этот вид скопирована.' : `Скопируйте ссылку вручную: ${url}`);
  });

  // Guided tour («Экскурсия»): the camera visits every point of the scene, then
  // walks through the door into the next scene. Any direct input stops it.
  const guideButton = root.querySelector('[data-guide]');
  const autoButton = root.querySelector('[data-auto]');
  let guide = null;
  const dwellTime = spot => Math.min(12000, Math.max(5000, 2500 + spot.text.length * 45));
  function runGuideTimer(ms) {
    if (!guideTimer) return;
    guideTimer.style.setProperty('--dwell', `${ms}ms`);
    guideTimer.classList.remove('is-running');
    void guideTimer.offsetWidth;
    guideTimer.classList.add('is-running');
  }
  function startGuide() {
    if (!fallback.hidden || root.classList.contains('is-loading')) return;
    setAuto(false);
    guide = { visited: new Set([state.scene]), queue: infoSpots(scenes[state.scene]), timer: 0, pendingScene: null };
    guideButton?.setAttribute('aria-pressed', 'true');
    root.classList.add('is-guided');
    announce('Экскурсия началась. Перемещение панорамы остановит её.');
    guideNext();
  }
  function stopGuide(message = '') {
    if (!guide) return;
    clearTimeout(guide.timer);
    guide = null;
    guideButton?.setAttribute('aria-pressed', 'false');
    root.classList.remove('is-guided');
    guideTimer?.classList.remove('is-running');
    if (message) announce(message);
  }
  function guideShow(spot, then) {
    flyTo(framing(spot), () => {
      if (!guide) return;
      if (spot.next) {
        closeCard(false);
        const placed = placedHotspots.find(item => item.spot === spot);
        if (placed) arm(placed.button, spot);
        announce(spot.action || spot.title);
      } else {
        openHotspot(spot, null, { focus: false });
        announce(spot.title);
      }
      const dwell = spot.next ? 650 : dwellTime(spot);
      runGuideTimer(dwell);
      guide.timer = setTimeout(then, dwell);
    });
  }
  function guideNext() {
    if (!guide) return;
    clearTimeout(guide.timer);
    const spot = guide.queue.shift();
    if (spot) { guideShow(spot, guideNext); return; }
    const exit = scenes[state.scene].hotspots.find(item => item.next && !guide.visited.has(item.next));
    if (exit) {
      guideShow(exit, () => {
        if (!guide) return;
        guide.visited.add(exit.next);
        guide.pendingScene = exit.next;
        goToScene(exit.next, exit);
      });
      return;
    }
    closeCard(false);
    stopGuide('Экскурсия завершена.');
  }
  function continueGuide() {
    guide.pendingScene = null;
    guide.queue = infoSpots(scenes[state.scene]);
    guide.timer = setTimeout(guideNext, 900);
  }
  guideButton?.addEventListener('click', () => (guide ? stopGuide('Экскурсия остановлена.') : startGuide()));

  // Automatic rotation; it pauses while the panorama is held.
  let autoFrame = 0, autoLast = 0;
  function autoTick(now) {
    autoFrame = 0;
    if (!state.auto) return;
    const dt = Math.min((now - autoLast) / 1000, 0.05);
    autoLast = now;
    if (!state.dragging && !flight && !document.hidden) {
      const position = viewer.getPosition();
      viewer.rotate({ yaw: position.yaw + dt * 0.08, pitch: position.pitch });
    }
    autoFrame = requestAnimationFrame(autoTick);
  }
  function setAuto(on) {
    state.auto = on;
    autoButton?.setAttribute('aria-pressed', String(on));
    if (on && !autoFrame) { autoLast = performance.now(); autoFrame = requestAnimationFrame(autoTick); }
  }
  autoButton?.addEventListener('click', () => {
    if (!state.auto) stopGuide();
    setAuto(!state.auto);
  });

  // Direct input: the engine turns and zooms the panorama itself; here it only
  // ends the guided tour and remembers that the visitor has taken control.
  function takeControl() {
    stopGuide();
    root.classList.add('has-interacted');
  }
  stage.addEventListener('pointerdown', () => { takeControl(); state.dragging = true; }, true);
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => { state.dragging = false; }, true);
  stage.addEventListener('wheel', takeControl, { capture: true, passive: true });
  // Keys and the zoom buttons move smoothly; repeated presses add up.
  let keyTarget = null;
  function nudge(dYaw, dPitch, dFov) {
    takeControl();
    const base = keyTarget && flight ? keyTarget : currentView();
    keyTarget = { yaw: base.yaw + dYaw, pitch: clampPitch(base.pitch + dPitch), fov: clampFov(base.fov + dFov) };
    const target = keyTarget;
    flyTo(target, () => { if (keyTarget === target) keyTarget = null; }, { duration: 500 });
    if (reducedMotion()) keyTarget = null;
  }
  root.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => nudge(0, 0, button.dataset.zoom === 'in' ? -0.22 : 0.22)));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!infoCard.hidden) { event.preventDefault(); stopGuide(); closeCard(); return; }
      if (guide) { event.preventDefault(); stopGuide('Экскурсия остановлена.'); return; }
      if (root.classList.contains('is-pseudo-fullscreen')) { event.preventDefault(); setPseudoFullscreen(false); fullscreenButton.focus(); return; }
    }
    if (event.target.closest('[role="tablist"], input, textarea')) return;
    const step = event.shiftKey ? 0.18 : 0.08;
    const moves = {
      ArrowLeft: [-step, 0, 0],
      ArrowRight: [step, 0, 0],
      ArrowUp: [0, step, 0],
      ArrowDown: [0, -step, 0],
      '+': [0, 0, -0.08],
      '=': [0, 0, -0.08],
      '-': [0, 0, 0.08]
    };
    if (!own(moves, event.key)) return;
    event.preventDefault();
    nudge(...moves[event.key]);
  });

  // Fullscreen. iPhone Safari has no element fullscreen, so the viewer expands
  // over the page instead.
  const fullscreenButton = root.querySelector('[data-fullscreen]');
  const nativeFullscreen = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const canUseNativeFullscreen = () => Boolean((root.requestFullscreen || root.webkitRequestFullscreen) && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true));
  function syncFullscreenButton() {
    const active = nativeFullscreen() === root || root.classList.contains('is-pseudo-fullscreen');
    fullscreenButton.setAttribute('aria-label', active ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран');
    root.classList.toggle('is-fullscreen', active);
    requestAnimationFrame(() => viewer.autoSize());
  }
  function setPseudoFullscreen(on) {
    root.classList.toggle('is-pseudo-fullscreen', on);
    document.documentElement.classList.toggle('tour-locked', on);
    syncFullscreenButton();
  }
  fullscreenButton.addEventListener('click', async () => {
    if (root.classList.contains('is-pseudo-fullscreen')) { setPseudoFullscreen(false); return; }
    try {
      if (nativeFullscreen()) await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
      else if (canUseNativeFullscreen()) await (root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen());
      else setPseudoFullscreen(true);
    } catch {
      setPseudoFullscreen(true);
    }
  });
  document.addEventListener('fullscreenchange', syncFullscreenButton);
  document.addEventListener('webkitfullscreenchange', syncFullscreenButton);

  // Gyroscope: part of the presence effect on touch devices, where orientation sensors exist.
  const gyroButton = root.querySelector('[data-gyro]');
  const canGyro = 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;
  if (gyroButton) gyroButton.hidden = !canGyro;
  let gyroWatchdog = 0, gyroFromPresence = false;
  // Converts W3C device orientation (Z-X'-Y'') to a viewing direction. The camera
  // looks out of the back of the device, so the result does not depend on
  // portrait or landscape screen orientation.
  function orientationToView(alpha, beta, gamma) {
    const a = alpha * Math.PI / 180, b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
    const x = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
    const y = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
    const z = -Math.cos(b) * Math.cos(g);
    return { yaw: Math.atan2(x, y), pitch: Math.asin(Math.max(-1, Math.min(1, z))) };
  }
  function setGyroPressed(on) { gyroButton?.setAttribute('aria-pressed', String(on)); }
  function disableGyro() {
    state.gyro = false;
    gyroYawOffset = null;
    clearTimeout(gyroWatchdog);
    setGyroPressed(false);
  }
  async function enableGyro() {
    if (!canGyro) return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') {
          setStatus('Доступ к датчикам движения не разрешён.');
          return false;
        }
      } catch {
        setStatus(window.isSecureContext ? 'Не удалось включить управление движением.' : 'Гироскоп работает только при открытии сайта по HTTPS.');
        return false;
      }
    }
    stopGuide();
    viewer.stopAnimation();
    state.gyro = true;
    gyroYawOffset = null;
    setGyroPressed(true);
    clearTimeout(gyroWatchdog);
    gyroWatchdog = setTimeout(() => {
      if (state.gyro && gyroYawOffset === null) {
        disableGyro();
        setStatus(window.isSecureContext ? 'Датчик движения не передаёт данные на этом устройстве.' : 'Гироскоп работает только при открытии сайта по HTTPS.');
      }
    }, 1500);
    return true;
  }
  gyroButton?.addEventListener('click', async () => {
    if (state.gyro) { disableGyro(); gyroFromPresence = false; } else { setStatus(''); await enableGyro(); }
  });
  window.addEventListener('deviceorientation', event => {
    if (!state.gyro || event.alpha == null || event.beta == null || event.gamma == null) return;
    const sensor = orientationToView(event.alpha, event.beta, event.gamma);
    // Keep the current view direction when the sensor takes over; while the
    // panorama is held, the finger sets the direction and the sensor follows.
    if (gyroYawOffset === null || state.dragging) {
      gyroYawOffset = viewer.getPosition().yaw - sensor.yaw;
      if (state.dragging) return;
    }
    viewer.rotate({ yaw: sensor.yaw + gyroYawOffset, pitch: clampPitch(sensor.pitch) });
  });

  // Presence effect («Эффект присутствия»): sound, red/blue light accents, vibration and, on
  // phones, the gyroscope. The sound is synthesized in the browser, without audio files:
  // outdoors — wind and distant traffic, in the cabin — ventilation and electrical hum; doors,
  // steps and a soft click accompany moves and points. Everything stops when the effect is off
  // or the tab is hidden.
  const presenceButton = root.querySelector('[data-presence], [data-effects]');
  const legacySoundButton = root.querySelector('[data-sound]');
  let suspendTimer = 0, ambient = null;
  function createAmbientSound() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    // iPhone: play like a video on the page, also with the ring/silent switch off.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
    const context = new Context();
    const gain = value => { const node = context.createGain(); node.gain.value = value; return node; };
    const filter = (type, frequency, q = 0.7) => {
      const node = context.createBiquadFilter();
      node.type = type; node.frequency.value = frequency; node.Q.value = q;
      return node;
    };
    const noise = brown => {
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate), data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = brown ? last * 3.5 : white;
      }
      return buffer;
    };
    const loop = (buffer, ...chain) => {
      const source = context.createBufferSource();
      source.buffer = buffer; source.loop = true;
      let node = source;
      for (const next of chain) node = node.connect(next);
      source.start(0, Math.random() * 2);
      return node;
    };
    const master = gain(0);
    master.connect(context.destination);
    const panner = context.createStereoPanner ? context.createStereoPanner() : null;
    if (panner) panner.connect(master);
    const bed = panner || master;
    const white = noise(false), brown = noise(true);
    // Outdoors: wind (band-passed noise that slowly swells) and distant traffic (low rumble).
    const outdoor = gain(0);
    outdoor.connect(bed);
    const wind = gain(0.5);
    loop(white, filter('bandpass', 520, 0.5), wind).connect(outdoor);
    const swell = context.createOscillator();
    swell.frequency.value = 0.07;
    swell.connect(gain(0.35)).connect(wind.gain);
    swell.start();
    loop(brown, filter('lowpass', 160), gain(0.9)).connect(outdoor);
    // Cabin: ventilation fan (band-passed noise) and a faint electrical hum.
    const cabin = gain(0);
    cabin.connect(bed);
    loop(white, filter('bandpass', 750, 0.9), filter('lowpass', 2400), gain(0.32)).connect(cabin);
    loop(brown, filter('lowpass', 220), gain(0.5)).connect(cabin);
    for (const [frequency, level] of [[100, 0.05], [200, 0.02]]) {
      const hum = context.createOscillator();
      hum.frequency.value = frequency;
      hum.connect(gain(level)).connect(cabin);
      hum.start();
    }
    return { context, master, panner, outdoor, cabin, white, brown };
  }
  function setSoundScene(view) {
    if (!ambient) return;
    const { context, outdoor, cabin } = ambient, now = context.currentTime, inside = view === 'interior';
    outdoor.gain.setTargetAtTime(inside ? 0 : 1, now, 0.35);
    cabin.gain.setTargetAtTime(inside ? 1 : 0, now, 0.35);
  }
  // Short sounds: a click for a point, a tick for a transition sign, a sliding side door,
  // a rear door, steps around the vehicle.
  function playSound(name) {
    if (!state.presence || !ambient || document.hidden) return;
    const { context, master, white, brown } = ambient, start = context.currentTime + 0.01;
    const envelope = (node, at, level, length) => {
      node.gain.setValueAtTime(0.0001, at);
      node.gain.exponentialRampToValueAtTime(level, at + 0.01);
      node.gain.exponentialRampToValueAtTime(0.0001, at + length);
    };
    const burst = (offset, { buffer = white, type = 'lowpass', from = 800, to = from, q = 0.7, length = 0.2, level = 0.5 }) => {
      const at = start + offset, source = context.createBufferSource(), shape = context.createBiquadFilter(), volume = context.createGain();
      source.buffer = buffer; shape.type = type; shape.Q.value = q;
      shape.frequency.setValueAtTime(from, at);
      if (to !== from) shape.frequency.exponentialRampToValueAtTime(to, at + length);
      envelope(volume, at, level, length);
      source.connect(shape).connect(volume).connect(master);
      source.start(at, Math.random() * 2);
      source.stop(at + length + 0.05);
    };
    const thump = (offset, { from = 95, to = 45, length = 0.18, level = 0.7 } = {}) => {
      const at = start + offset, tone = context.createOscillator(), volume = context.createGain();
      tone.frequency.setValueAtTime(from, at);
      tone.frequency.exponentialRampToValueAtTime(to, at + length);
      envelope(volume, at, level, length);
      tone.connect(volume).connect(master);
      tone.start(at);
      tone.stop(at + length + 0.05);
    };
    if (name === 'point') thump(0, { from: 1700, to: 1100, length: 0.06, level: 0.12 });
    else if (name === 'arm') thump(0, { from: 1200, to: 900, length: 0.04, level: 0.08 });
    else if (name === 'slide') {
      burst(0, { type: 'bandpass', from: 380, to: 1300, q: 1.1, length: 0.55, level: 0.35 });
      thump(0.5, { from: 120, to: 50, level: 0.8 });
      burst(0.5, { from: 300, length: 0.12, level: 0.4 });
    } else if (name === 'swing') {
      burst(0, { type: 'bandpass', from: 900, to: 500, q: 2, length: 0.35, level: 0.2 });
      thump(0.3, { from: 90, to: 42, level: 0.9 });
      burst(0.3, { from: 260, length: 0.14, level: 0.45 });
    } else if (name === 'steps') {
      for (let i = 0; i < 4; i++) {
        burst(i * 0.3, { buffer: brown, from: 700, length: 0.09, level: 0.5 });
        thump(i * 0.3, { from: 75, to: 40, length: 0.08, level: 0.35 });
      }
    }
  }
  // Vibration: Android and other browsers with navigator.vibrate. Safari on iPhone has no
  // vibration API; iOS 17.4–26.4 give a system tap when a switch control toggles, so a hidden
  // one is toggled inside the visitor's tap (Apple closed this in iOS 26.5).
  const appleTouch = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function haptic(pattern = 25) {
    if (!state.presence) return;
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(pattern); return; }
    if (!appleTouch) return;
    try {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
      label.setAttribute('aria-hidden', 'true'); label.style.display = 'none';
      label.append(input); document.body.append(label);
      label.click();
      label.remove();
    } catch { /* no haptics */ }
  }
  // A move between scenes sounds like the way it is made: the side door, the rear doors or steps around the vehicle.
  function moveFeedback(from, to) {
    const a = scenes[from]?.view, b = scenes[to]?.view;
    if (!state.presence || !a || !b || a === b) return;
    const pair = [a, b].sort().join('-');
    playSound(pair === 'interior-yard' ? 'slide' : pair === 'exterior-interior' ? 'swing' : 'steps');
    haptic([20, 40, 20]);
  }
  viewer.addEventListener('position-updated', event => {
    if (ambient?.panner) ambient.panner.pan.value = Math.sin(event.position.yaw) * 0.7;
  });
  async function updateAmbient() {
    try {
      if (state.presence && !ambient) {
        ambient = createAmbientSound();
        setSoundScene(scenes[state.scene]?.view);
      }
      if (!ambient) {
        if (state.presence) setStatus('Звук недоступен, остальные эффекты продолжают работать.');
        return;
      }
      const { context, master } = ambient;
      const play = state.presence && !document.hidden;
      clearTimeout(suspendTimer);
      if (play) await context.resume();
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(play ? 0.4 : 0, context.currentTime, 0.08);
      if (!play) suspendTimer = setTimeout(() => { if (!state.presence || document.hidden) context.suspend(); }, 350);
    } catch {
      setStatus('Звук недоступен, остальные эффекты продолжают работать.');
    }
  }
  async function togglePresence() {
    const on = !state.presence;
    state.presence = on;
    root.classList.toggle('presence-on', on);
    root.classList.toggle('effects-off', !on);
    presenceButton?.setAttribute('aria-pressed', String(on));
    legacySoundButton?.setAttribute('aria-pressed', String(on));
    setStatus('');
    announce(on ? 'Эффект присутствия включён.' : 'Эффект присутствия выключен.');
    haptic([25, 35, 25]);
    // Sound and the iOS sensor permission both need the click itself, so both start before any await.
    const sound = updateAmbient();
    const gyro = on && canGyro && !state.gyro ? enableGyro() : Promise.resolve(false);
    if (!on && gyroFromPresence) { disableGyro(); gyroFromPresence = false; }
    const [, gyroStarted] = await Promise.all([sound, gyro]);
    if (gyroStarted) {
      if (state.presence) gyroFromPresence = true;
      else disableGyro();
    }
  }
  if (presenceButton) {
    presenceButton.setAttribute('aria-pressed', 'false');
    presenceButton.addEventListener('click', togglePresence);
  }
  if (legacySoundButton) {
    legacySoundButton.setAttribute('aria-pressed', 'false');
    legacySoundButton.addEventListener('click', () => presenceButton ? presenceButton.click() : togglePresence());
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeech();
    if (ambient) updateAmbient();
  });
  window.addEventListener('pagehide', () => { stopSpeech(); ambient?.context.suspend(); });

  // VR headsets (WebXR; HTTPS and a compatible headset only). The engine has no
  // WebXR mode, so the headset gets its own small WebGL sphere with the full panorama.
  function createSphereRenderer(gl, imageUrl) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader');
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec2 t;uniform mat4 m;uniform mat4 v;varying vec2 u;void main(){u=t;gl_Position=m*v*vec4(p,1.0);}'));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 u;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,u);}'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(program);
    const positions = [], uvs = [], indices = [], segments = 64, rings = 32;
    for (let y = 0; y <= rings; y++) {
      const v = y / rings, phi = v * Math.PI;
      for (let x = 0; x <= segments; x++) {
        const u = x / segments, theta = u * TAU;
        positions.push(-Math.sin(theta) * Math.sin(phi) * 10, Math.cos(phi) * 10, Math.cos(theta) * Math.sin(phi) * 10);
        uvs.push(u, v);
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x, b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const attribute = (data, size, name) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    attribute(positions, 3, 'p');
    attribute(uvs, 2, 't');
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const projectionLocation = gl.getUniformLocation(program, 'm'), viewLocation = gl.getUniformLocation(program, 'v');
    gl.uniform1i(gl.getUniformLocation(program, 's'), 0);
    const texture = gl.createTexture();
    let ready = false;
    loadImage(imageUrl).then(image => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
    }, () => setStatus('Не удалось загрузить панораму для VR.'));
    gl.disable(gl.CULL_FACE);
    return {
      draw(projection, view, viewport) {
        gl.viewport(...viewport);
        gl.clearColor(0.02, 0.055, 0.045, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (!ready) return;
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniformMatrix4fv(projectionLocation, false, projection);
        gl.uniformMatrix4fv(viewLocation, false, view);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      }
    };
  }
  const vrButton = root.querySelector('[data-vr]');
  let xrSession = null;
  async function setupVR() {
    if (!vrButton || !navigator.xr || !window.isSecureContext) return;
    try { if (await navigator.xr.isSessionSupported('immersive-vr')) vrButton.hidden = false; } catch {}
  }
  vrButton?.addEventListener('click', async () => {
    if (xrSession) { xrSession.end().catch(() => {}); return; }
    let session = null;
    try {
      stopGuide();
      const gl = document.createElement('canvas').getContext('webgl', { xrCompatible: true, alpha: false });
      if (!gl) throw new Error('webgl');
      session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      xrSession = session;
      if (gl.makeXRCompatible) await gl.makeXRCompatible();
      const sphere = createSphereRenderer(gl, scenes[state.scene].image);
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
      const referenceSpace = await session.requestReferenceSpace('local');
      session.addEventListener('end', () => {
        xrSession = null;
        vrButton.textContent = 'Войти в VR';
        viewer.needsUpdate();
      });
      const xrFrame = (time, frameData) => {
        const current = frameData.session, pose = frameData.getViewerPose(referenceSpace);
        gl.bindFramebuffer(gl.FRAMEBUFFER, current.renderState.baseLayer.framebuffer);
        if (pose) for (const view of pose.views) {
          const viewport = current.renderState.baseLayer.getViewport(view), matrix = new Float32Array(view.transform.inverse.matrix);
          matrix[12] = matrix[13] = matrix[14] = 0;
          sphere.draw(view.projectionMatrix, matrix, [viewport.x, viewport.y, viewport.width, viewport.height]);
        }
        current.requestAnimationFrame(xrFrame);
      };
      session.requestAnimationFrame(xrFrame);
      vrButton.textContent = 'Выйти из VR';
    } catch {
      if (session) session.end().catch(() => {});
      xrSession = null;
      setStatus('VR-режим недоступен на этом устройстве.');
    }
  });

  const requested = parseHash(location.hash.slice(1));
  loadScene(requested ? requested.scene : defaultScene, false, requested ? requested.view : null);
  setupVR();
})();

