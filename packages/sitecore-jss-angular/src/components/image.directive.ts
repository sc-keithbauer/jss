import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  Renderer2,
  SimpleChanges,
  TemplateRef,
  Type,
  ViewContainerRef,
} from '@angular/core';
import { mediaApi } from '@sitecore-jss/sitecore-jss/media';
import { ImageField, ImageFieldValue } from './rendering-field';
import { BaseFieldDirective } from './base-field.directive';
import { DefaultEmptyImageFieldEditingComponent } from './default-empty-image-field-editing-placeholder.component';
import { MetadataKind } from '@sitecore-jss/sitecore-jss/editing';

@Directive({ selector: '[scImage]' })
export class ImageDirective extends BaseFieldDirective implements OnChanges {
  @Input('scImage') field: ImageField;

  @Input('scImageEditable') editable = true;

  /**
   * Custom regexp that finds media URL prefix that will be replaced by `/-/jssmedia` or `/~/jssmedia`.
   * @example
   * /\/([-~]{1})assets\//i
   * /-assets/website -> /-/jssmedia/website
   * /~assets/website -> /~/jssmedia/website
   */
  @Input('scImageMediaUrlPrefix') mediaUrlPrefix?: RegExp;

  @Input('scImageUrlParams') urlParams: { [param: string]: string | number } = {};

  @Input('scImageAttrs') attrs: { [param: string]: unknown } = {};

  /**
   * Custom template to render in Pages in Metadata edit mode if field value is empty
   */
  @Input('scImageEmptyFieldEditingTemplate') emptyFieldEditingTemplate: TemplateRef<unknown>;

  /**
   * Default component to render in Pages in Metadata edit mode if field value is empty and emptyFieldEditingTemplate is not provided
   */
  protected defaultFieldEditingComponent: Type<unknown>;

  private inlineRef: HTMLSpanElement | null = null;

  constructor(
    viewContainer: ViewContainerRef,
    private templateRef: TemplateRef<unknown>,
    private renderer: Renderer2,
    private elementRef: ElementRef
  ) {
    super(viewContainer);
    this.defaultFieldEditingComponent = DefaultEmptyImageFieldEditingComponent;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.field || changes.editable || changes.urlParams || changes.attrs) {
      this.viewContainer.clear();
      if (this.inlineRef) {
        this.inlineRef.remove();
        this.inlineRef = null;
      }

      this.updateView();
    }
  }

  private updateView() {
    if (!this.shouldRender()) {
      super.renderEmpty();
      return;
    }

    const overrideAttrs = {
      ...this.getElementAttrs(),
      ...this.attrs,
    };
    const media = this.field;

    let attrs: { [attr: string]: string } | null = {};

    // we likely have an experience editor value, should be a string
    if (this.editable && media.editable) {
      const foundImg = mediaApi.findEditorImageTag(media.editable);
      if (!foundImg) {
        return this.renderInlineWrapper(media.editable);
      }
      attrs = this.getImageAttrs(foundImg.attrs, overrideAttrs, this.urlParams);
      if (!attrs) {
        return this.renderInlineWrapper(media.editable);
      }
      const tempImg: HTMLImageElement = this.renderer.createElement('img');
      Object.entries(attrs).forEach(([key, attrValue]: [string, string]) =>
        tempImg.setAttribute(key, attrValue)
      );
      const editableMarkup = media.editable.replace(foundImg.imgTag, tempImg.outerHTML);
      return this.renderInlineWrapper(editableMarkup);
    }

    // some wise-guy/gal is passing in a 'raw' image object value
    const img = media.src ? media : media.value;
    if (!img) {
      return null;
    }

    attrs = this.getImageAttrs(img, overrideAttrs, this.urlParams);
    if (attrs) {
      this.renderMetadata(MetadataKind.Open);
      this.renderTemplate(attrs);
      this.renderMetadata(MetadataKind.Close);
    }
  }

  private getImageAttrs(
    fieldAttrs: ImageFieldValue,
    parsedAttrs: { [attr: string]: unknown },
    imageParams: { [param: string]: string | number }
  ): { [attr: string]: string } | null {
    const combinedAttrs = {
      ...fieldAttrs,
      ...parsedAttrs,
    };
    // eslint-disable-next-line prefer-const
    let { src, srcSet, ...otherAttrs } = combinedAttrs;
    if (!src) {
      return null;
    }
    const newAttrs: { [attr: string]: string } = {
      ...(otherAttrs as { [key: string]: string }),
    };
    // update image URL for jss handler and image rendering params
    src = mediaApi.updateImageUrl(src, imageParams, this.mediaUrlPrefix);
    if (srcSet) {
      // replace with HTML-formatted srcset, including updated image URLs
      newAttrs.srcSet = mediaApi.getSrcSet(src, srcSet, imageParams, this.mediaUrlPrefix);
    } else {
      newAttrs.src = src;
    }
    return newAttrs;
  }

  private renderTemplate(imageProps: { [prop: string]: string }) {
    const viewRef = this.viewContainer.createEmbeddedView(this.templateRef);
    viewRef.rootNodes.forEach((node) => {
      Object.entries(imageProps).forEach(([key, imgPropVal]: [string, string]) =>
        this.renderer.setAttribute(node, key, imgPropVal)
      );
    });
  }

  private getElementAttrs(): { [key: string]: string } {
    const view = this.templateRef.createEmbeddedView(null);
    const element: Element = view.rootNodes[0];
    if (!element) {
      view.destroy();
      return {};
    }
    const attrs: { [key: string]: string } = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes.item(i);
      if (attr) {
        attrs[attr.name] = attr.value;
      }
    }
    view.destroy();
    return attrs;
  }

  private renderInlineWrapper(editable: string) {
    const span: HTMLSpanElement = this.renderer.createElement('span');
    span.className = 'sc-image-wrapper';
    span.innerHTML = editable;

    const parentNode = this.renderer.parentNode(this.elementRef.nativeElement);
    this.renderer.insertBefore(parentNode, span, this.elementRef.nativeElement);
    parentNode.removeChild(this.elementRef.nativeElement);

    this.inlineRef = span;
  }
}
